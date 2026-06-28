/**
 * One per opened "Inspect views" target on the extensions page.
 *
 * Owns:
 *   - a chii frontend iframe mounted into a caller-provided DOM node
 *   - a per-target CdpMultiplexer wired to the chii frontend
 *   - the transport leg from the target (iframe or worker) into the
 *     multiplexer, and back
 *
 * Why a fresh multiplexer per session instead of sharing one with the
 * tab DevTools manager:
 *   - The CdpMultiplexer's frame graph is currently rooted at one
 *     top-level target. Extension targets have their own "top frame"
 *     (the BG iframe, or the worker realm). They're not children of
 *     any tab.
 *   - Sessions can be opened independently of any tab session; we
 *     don't want to require tab DevTools to be open just to inspect
 *     a background page.
 *
 * The chii frontend itself is identical to the one used for tab
 * DevTools — same FakeWebSocket shim, same CDP protocol. We just feed
 * it from a different multiplexer.
 */

import { CdpMultiplexer } from './multiplexer';
import { decodeEnvelope } from './frameTransport';
import { isWorkerOutboundMessage } from './workerTransport';
import type {
	DevtoolsBridgeMessage,
	DevtoolsMessage,
} from './types';
import type { ExtensionTarget, WorkerTarget } from './extensionTargetRegistry';

interface IframeSessionOpts {
	devtoolsHostUrl: string;
	target: Exclude<ExtensionTarget, WorkerTarget>;
	/** Called by the session when its DOM is removed (user closed). */
	onClose: () => void;
}

interface WorkerSessionOpts {
	devtoolsHostUrl: string;
	target: WorkerTarget;
	/** Source of the worker-flavoured devtools-agent IIFE bundle. */
	workerAgentSource: string;
	onClose: () => void;
}

const VALID_INNER_KINDS = new Set([
	'frame-ready',
	'frame-gone',
	'cdp-out',
	'cdp-in',
	'agent-error',
]);
const DEVTOOLS_HOST_TAG = '__ddxDevtoolsMsg';

function decodeUnwrapped(raw: unknown): DevtoolsMessage | null {
	if (!raw || typeof raw !== 'object') return null;
	const d = raw as Record<string, unknown>;
	if (d[DEVTOOLS_HOST_TAG] !== true) return null;
	const kind = d.kind;
	if (typeof kind !== 'string' || !VALID_INNER_KINDS.has(kind)) return null;
	return raw as DevtoolsMessage;
}

/**
 * Shared base for both flavours. Owns the chii iframe, the multiplexer,
 * the host↔chii bridge, and the close button. Subclasses define how to
 * talk to the target (iframe agent vs worker agent).
 */
abstract class ExtensionDevToolsSessionBase {
	protected readonly container: HTMLDivElement;
	protected readonly chiiIframe: HTMLIFrameElement;
	protected readonly multiplexer: CdpMultiplexer;
	protected readonly hostMessageListener: (ev: MessageEvent) => void;
	protected destroyed = false;
	protected onClose: () => void;

	constructor(devtoolsHostUrl: string, onClose: () => void) {
		this.onClose = onClose;

		// IMPORTANT: the panel mounts in the HOST document body, not in
		// the extensions-page iframe DOM. Why: the chii frontend's
		// WebSocket shim does `window.parent.postMessage(...)` to
		// reach this session's message listener. If the chii iframe is
		// nested inside another iframe (the extensions page), its
		// `window.parent` is that intermediate iframe, NOT the host —
		// and our listener (on the host window) never receives anything.
		// Mounting at the host body makes the chii iframe's parent the
		// host window directly, so postMessage lands here.
		this.container = document.createElement('div');
		this.container.className = 'ddx-ext-devtools-panel';
		Object.assign(this.container.style, {
			position: 'fixed',
			left: '0',
			right: '0',
			bottom: '0',
			height: '420px',
			background: '#1e1e1e',
			borderTop: '1px solid rgba(255,255,255,0.08)',
			boxShadow: '0 -4px 16px rgba(0,0,0,0.35)',
			zIndex: '2147483647',
			display: 'flex',
			flexDirection: 'column',
		} as Partial<CSSStyleDeclaration>);

		const header = document.createElement('div');
		Object.assign(header.style, {
			flex: '0 0 28px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			padding: '0 8px',
			background: '#252525',
			borderBottom: '1px solid #333',
			fontSize: '11px',
			fontFamily: 'system-ui, sans-serif',
			color: '#ddd',
		} as Partial<CSSStyleDeclaration>);

		const title = document.createElement('span');
		title.textContent = 'DevTools';
		title.dataset.role = 'title';
		header.appendChild(title);

		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.textContent = '✕';
		Object.assign(closeBtn.style, {
			background: 'transparent',
			border: 'none',
			color: '#aaa',
			fontSize: '14px',
			cursor: 'pointer',
			padding: '0 4px',
			lineHeight: '1',
		} as Partial<CSSStyleDeclaration>);
		closeBtn.addEventListener('click', () => this.close());
		header.appendChild(closeBtn);

		this.chiiIframe = document.createElement('iframe');
		this.chiiIframe.src = devtoolsHostUrl;
		Object.assign(this.chiiIframe.style, {
			flex: '1 1 auto',
			width: '100%',
			border: '0',
			minHeight: '0',
		} as Partial<CSSStyleDeclaration>);

		this.container.appendChild(header);
		this.container.appendChild(this.chiiIframe);
		document.body.appendChild(this.container);

		this.multiplexer = new CdpMultiplexer({
			postToDevTools: (cdpJson) => this.sendToDevtoolsIframe(cdpJson),
		});

		this.hostMessageListener = (ev) => this.onHostMessage(ev);
		window.addEventListener('message', this.hostMessageListener);
		console.log('[ddx-ext-devtools] session constructed; chii iframe mounted to host body');
	}

	/** Set the header title (subclasses use the target label). */
	protected setTitle(label: string): void {
		const t = this.container.querySelector('[data-role=title]') as HTMLSpanElement | null;
		if (t) t.textContent = label;
	}

	close(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		console.log('[ddx-ext-devtools] session.close: starting teardown');

		// Phase 1: detach our event listeners and stop talking to the
		// target. Don't touch DOM yet.
		try {
			window.removeEventListener('message', this.hostMessageListener);
		} catch (err) {
			console.warn('[ddx-ext-devtools] removeEventListener threw:', err);
		}
		try {
			this.beforeDestroy();
		} catch (err) {
			console.warn('[ddx-ext-devtools] beforeDestroy threw:', err);
		}

		// Phase 2: drain the chii frontend BEFORE removing the iframe.
		// Removing a Chrome-DevTools-frontend iframe mid-init (or even
		// post-init while it has pending CDP state) can crash the
		// renderer (STATUS_ACCESS_VIOLATION). Navigating it to
		// about:blank first lets the frontend tear down its own state
		// in the iframe's own task queue. We then remove the container
		// from the host body on the next animation frame so any
		// synchronous teardown work the frontend triggers has a chance
		// to land.
		try {
			this.chiiIframe.src = 'about:blank';
		} catch (err) {
			console.warn('[ddx-ext-devtools] chii navigate to blank failed:', err);
		}

		requestAnimationFrame(() => {
			try {
				this.container.remove();
			} catch (err) {
				console.warn('[ddx-ext-devtools] container.remove threw:', err);
			}
			try {
				this.onClose();
			} catch (err) {
				console.warn('[ddx-ext-devtools] onClose threw:', err);
			}
			console.log('[ddx-ext-devtools] session.close: teardown complete');
		});
	}

	/** Called after `destroyed = true` is set, before the DOM is removed. */
	protected abstract beforeDestroy(): void;

	/** Subclasses route inbound agent messages to the multiplexer here. */
	protected abstract onTargetSourceMessage(ev: MessageEvent): void;

	private sendToDevtoolsIframe(cdpJson: string): void {
		const target = this.chiiIframe.contentWindow;
		if (!target) return;
		const msg: DevtoolsBridgeMessage = {
			kind: 'cdp-to-devtools',
			payload: cdpJson,
		};
		try {
			target.postMessage(msg, '*');
		} catch {
			/* ignore */
		}
	}

	private onHostMessage(ev: MessageEvent): void {
		if (this.destroyed) return;

		// 1) chii frontend → us. Same-origin postMessage from our iframe.
		if (ev.source === this.chiiIframe.contentWindow) {
			const d = ev.data as DevtoolsBridgeMessage | undefined;
			if (!d || typeof d !== 'object') return;
			if (d.kind === 'devtools-ready') return;
			if (
				d.kind === 'cdp-from-devtools' &&
				typeof d.payload === 'string'
			) {
				this.multiplexer.receiveFromDevTools(d.payload);
			}
			return;
		}

		// 2) Target → us. Subclass-specific.
		this.onTargetSourceMessage(ev);
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Iframe-target flavour (background / popup / options / devtools-page).
//
// Reuses the existing devtools-agent.js that lives in every proxied
// iframe — host calls `iframe.contentWindow.__ddxDevtoolsReceive(...)`
// to push CDP requests, and the agent posts cdp-out events back via
// the scramjet envelope picked up here on the message listener.
// ─────────────────────────────────────────────────────────────────────────

export class ExtensionIframeDevToolsSession extends ExtensionDevToolsSessionBase {
	private readonly target: Exclude<ExtensionTarget, WorkerTarget>;
	private windowsByFrameId = new Map<string, Window>();

	constructor(opts: IframeSessionOpts) {
		super(opts.devtoolsHostUrl, opts.onClose);
		this.target = opts.target;
		this.setTitle(`DevTools — ${opts.target.label}`);
		// The hookInstaller's init.post hook will inject the per-frame
		// agent into the target iframe (since the manager flipped
		// isIframeWanted true before instantiating us). The agent's
		// frame-ready message arrives via the global message listener
		// and is filtered by ownsWindow() against this.target.iframe.
		console.log(
			'[ddx-ext-devtools] iframe session created for',
			opts.target.kind,
			opts.target.extId,
			'iframe:',
			!!opts.target.iframe?.contentWindow,
		);
	}

	protected beforeDestroy(): void {
		// The multiplexer fires Target.detachedFromTarget on its own as
		// frames detach. The agent stays installed in the iframe; it
		// keeps running quietly until the iframe itself is torn down.
		this.windowsByFrameId.clear();
	}

	protected onTargetSourceMessage(ev: MessageEvent): void {
		if (!ev.source) return;
		// Only accept messages from windows belonging to this target's
		// iframe tree. Compare top-frame contentWindow against ours.
		// Without this scope check, multiple concurrent extension
		// sessions would cross-talk (each receives every other agent's
		// cdp-out / frame-ready events because they all share the host's
		// window message bus).
		const src = ev.source as Window;
		if (!this.ownsWindow(src)) return;
		const decoded = decodeEnvelope(ev.data) ?? decodeUnwrapped(ev.data);
		if (!decoded) return;
		this.handleAgentMessage(decoded, src);
	}

	private ownsWindow(candidate: Window): boolean {
		// Fast path: target's contentWindow is identical.
		try {
			if (candidate === this.target.iframe.contentWindow) return true;
		} catch {
			return false;
		}
		// Walk up parents looking for our target's contentWindow. Cross-
		// origin frame access throws; treat that as "not ours."
		try {
			let cur: Window | null = candidate;
			let hops = 0;
			while (cur && hops < 8) {
				if (cur.parent === cur) return false; // hit top, didn't match
				try {
					if (cur.parent === this.target.iframe.contentWindow) return true;
				} catch {
					return false;
				}
				cur = cur.parent;
				hops++;
			}
		} catch {
			return false;
		}
		return false;
	}

	private handleAgentMessage(msg: DevtoolsMessage, win: Window): void {
		switch (msg.kind) {
			case 'frame-ready':
				this.windowsByFrameId.set(msg.frameId, win);
				this.multiplexer.attachFrame({
					frameId: msg.frameId,
					parentFrameId: msg.parentFrameId,
					url: msg.url,
					title: msg.title,
					postToFrame: (cdpJson) =>
						this.sendCdpToIframeAgent(win, msg.frameId, cdpJson),
				});
				return;
			case 'frame-gone':
				this.multiplexer.detachFrame(msg.frameId);
				this.windowsByFrameId.delete(msg.frameId);
				return;
			case 'cdp-out':
				this.multiplexer.receiveFromFrame(msg.frameId, msg.payload);
				return;
			case 'agent-error':
				console.warn(
					'[ddx-ext-devtools] agent error',
					msg.frameId,
					msg.message,
				);
				return;
			default:
				return;
		}
	}

	private sendCdpToIframeAgent(win: Window, frameId: string, cdpJson: string): void {
		// Same mechanism as DevToolsSession.sendCdpToAgent — the agent
		// installed `__ddxDevtoolsReceive` on its proxied window.
		try {
			const recv = (win as unknown as {
				__ddxDevtoolsReceive?: (frameId: string, payload: string) => void;
			}).__ddxDevtoolsReceive;
			if (typeof recv !== 'function') return;
			recv(frameId, cdpJson);
		} catch (err) {
			console.warn('[ddx-ext-devtools] sendCdpToIframeAgent failed:', err);
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Worker-target flavour (content-script Neutron worker).
//
// Vanilla worker.postMessage / worker.onmessage. Pipes worker-out
// messages into the multiplexer and worker-in for outbound CDP.
// ─────────────────────────────────────────────────────────────────────────

export class ExtensionWorkerDevToolsSession extends ExtensionDevToolsSessionBase {
	private readonly target: WorkerTarget;
	private readonly workerListener: (e: MessageEvent) => void;
	/** Cached so we don't generate a fresh id per session restart. */
	private readonly frameId: string;

	constructor(opts: WorkerSessionOpts) {
		super(opts.devtoolsHostUrl, opts.onClose);
		this.target = opts.target;
		this.frameId = `worker:${opts.target.extId}:${opts.target.scriptKey}`;
		this.setTitle(`DevTools — ${opts.target.label} (tab ${opts.target.tabId})`);
		console.log(
			'[ddx-ext-devtools] worker session created for',
			opts.target.extId,
			'scriptKey:',
			opts.target.scriptKey,
			'tabId:',
			opts.target.tabId,
		);

		this.workerListener = (e: MessageEvent) => this.onWorkerMessage(e);
		this.target.worker.addEventListener('message', this.workerListener);
		this.target.worker.addEventListener('error', this.onWorkerError);

		// Pre-register the worker as a frame in the multiplexer with a
		// postToFrame that bridges to worker-in. The multiplexer needs
		// a top-level frame to emit Target events meaningfully; the
		// agent will also post its own frame-ready, which is a no-op
		// for an already-registered frame (just updates metadata).
		this.multiplexer.attachFrame({
			frameId: this.frameId,
			parentFrameId: null,
			url: this.target.url,
			title: this.target.label,
			postToFrame: (cdpJson) => this.sendCdpToWorker(cdpJson),
		});

		// Push the worker agent into the worker.
		try {
			this.target.worker.postMessage({
				type: 'helium.devtools.worker-attach',
				src: opts.workerAgentSource,
				frameId: this.frameId,
				url: this.target.url,
				title: this.target.label,
			});
		} catch (err) {
			console.warn('[ddx-ext-devtools] worker-attach postMessage failed:', err);
		}
	}

	protected beforeDestroy(): void {
		try {
			this.target.worker.removeEventListener('message', this.workerListener);
		} catch { /* ignore */ }
		try {
			this.target.worker.removeEventListener('error', this.onWorkerError);
		} catch { /* ignore */ }
		try {
			this.multiplexer.detachFrame(this.frameId);
		} catch { /* ignore */ }
	}

	protected onTargetSourceMessage(_ev: MessageEvent): void {
		// Workers don't dispatch through window — handled by our
		// worker.addEventListener instead.
	}

	private onWorkerMessage(e: MessageEvent): void {
		if (this.destroyed) return;
		const data = e.data;
		if (!isWorkerOutboundMessage(data)) return;
		const msg = data.message;
		switch (msg.kind) {
			case 'frame-ready':
				// Already attached at session start. The agent's
				// frame-ready confirms it's alive; nothing more to do.
				return;
			case 'frame-gone':
				this.multiplexer.detachFrame(this.frameId);
				return;
			case 'cdp-out':
				this.multiplexer.receiveFromFrame(this.frameId, msg.payload);
				return;
			case 'agent-error':
				console.warn(
					'[ddx-ext-devtools] worker agent error',
					msg.frameId,
					msg.message,
				);
				return;
			default:
				return;
		}
	}

	private readonly onWorkerError = (e: ErrorEvent): void => {
		console.warn('[ddx-ext-devtools] worker errored:', e.message);
		// Worker is effectively dead; close the session so chii UI
		// doesn't sit attached to a dead target.
		this.close();
	};

	private sendCdpToWorker(cdpJson: string): void {
		try {
			this.target.worker.postMessage({
				type: 'helium.devtools.worker-in',
				frameId: this.frameId,
				payload: cdpJson,
			});
		} catch (err) {
			console.warn('[ddx-ext-devtools] sendCdpToWorker failed:', err);
		}
	}
}

export type ExtensionDevToolsSession =
	| ExtensionIframeDevToolsSession
	| ExtensionWorkerDevToolsSession;
