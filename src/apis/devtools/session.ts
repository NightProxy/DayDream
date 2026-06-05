/**
 * Per-tab devtools session.
 */

import { CdpMultiplexer } from './multiplexer';
import { decodeEnvelope, DEVTOOLS_HOST_TAG } from './frameTransport';
import { mountPanel, unmountPanel, type PanelHandle } from './panel';
import type { DevtoolsBridgeMessage, DevtoolsMessage } from './types';

interface TabLike {
	id: string;
	iframe: HTMLIFrameElement;
	devtoolsPanel?: PanelHandle | undefined;
}

interface SessionOpts {
	tabId: string;
	tabData: TabLike;
	devtoolsHostUrl: string;
	onClose: () => void;
}

const VALID_INNER_KINDS = new Set([
	'frame-ready',
	'frame-gone',
	'cdp-out',
	'cdp-in',
	'agent-error',
]);

function decodeUnwrapped(raw: unknown): DevtoolsMessage | null {
	if (!raw || typeof raw !== 'object') return null;
	const d = raw as Record<string, unknown>;
	if (d[DEVTOOLS_HOST_TAG] !== true) return null;
	const kind = d.kind;
	if (typeof kind !== 'string' || !VALID_INNER_KINDS.has(kind)) return null;
	return raw as DevtoolsMessage;
}

export class DevToolsSession {
	readonly tabId: string;
	private tabData: TabLike;
	private multiplexer: CdpMultiplexer;
	private panel: PanelHandle;
	private windowsByFrameId = new Map<string, Window>();
	private attachedWindows = new Set<Window>();
	private destroyed = false;
	private hostMessageListener: (ev: MessageEvent) => void;

	constructor(opts: SessionOpts) {
		this.tabId = opts.tabId;
		this.tabData = opts.tabData;
		this.panel = mountPanel(opts.tabData, opts.devtoolsHostUrl);
		opts.tabData.devtoolsPanel = this.panel;

		this.multiplexer = new CdpMultiplexer({
			postToDevTools: (cdpJson) => this.sendToDevtoolsIframe(cdpJson),
		});

		this.hostMessageListener = (ev) => this.onHostMessage(ev);
		window.addEventListener('message', this.hostMessageListener);
	}

	show(): void {
		if (this.destroyed) return;
		this.panel.container.style.display = 'flex';
		this.panel.isActive = true;
	}

	hide(): void {
		if (this.destroyed) return;
		this.panel.container.style.display = 'none';
		this.panel.isActive = false;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		try {
			window.removeEventListener('message', this.hostMessageListener);
		} catch {
			// ignore
		}
		unmountPanel(this.tabData);
		this.windowsByFrameId.clear();
		this.attachedWindows.clear();
	}

	attachProxiedWindow(win: Window): void {
		this.attachedWindows.add(win);
	}

	detachProxiedWindow(win: Window): void {
		this.attachedWindows.delete(win);
		for (const [frameId, w] of this.windowsByFrameId) {
			if (w === win) {
				this.windowsByFrameId.delete(frameId);
				this.multiplexer.detachFrame(frameId);
			}
		}
	}

	private sendToDevtoolsIframe(cdpJson: string): void {
		const target = this.panel.devtoolsIframe.contentWindow;
		if (!target) return;
		const msg: DevtoolsBridgeMessage = {
			kind: 'cdp-to-devtools',
			payload: cdpJson,
		};
		try {
			target.postMessage(msg, '*');
		} catch {
			// ignore
		}
	}

	private onHostMessage(ev: MessageEvent): void {
		if (this.destroyed) return;

		// 1) DevTools iframe -> us. Plain bridge message (same-origin,
		//    no Scramjet involved).
		if (ev.source === this.panel.devtoolsIframe.contentWindow) {
			const d = ev.data as DevtoolsBridgeMessage | undefined;
			if (!d || typeof d !== 'object') return;
			if (d.kind === 'devtools-ready') {
				console.log('[ddx-devtools] devtools iframe ready');
				return;
			}
			if (
				d.kind === 'cdp-from-devtools' &&
				typeof d.payload === 'string'
			) {
				console.log(
					'[ddx-devtools] DT->host CDP',
					d.payload.slice(0, 200)
				);
				this.multiplexer.receiveFromDevTools(d.payload);
			}
			return;
		}

		// 2) Proxied window -> us. Source must be a window we registered
		//    via the hook installer. Payload may arrive in two shapes:
		//      a) full Scramjet envelope (wrapper passed it through)
		//      b) pre-unwrapped DevtoolsMessage (Scramjet's incoming
		//         hook on the proxied side stripped the envelope before
		//         it reached the host)
		//    Try both. Drop silently if neither matches.
		if (ev.source && this.attachedWindows.has(ev.source as Window)) {
			let decoded = decodeEnvelope(ev.data) ?? decodeUnwrapped(ev.data);
			if (!decoded) {
				return;
			}
			console.log('[ddx-devtools] agent->host', decoded.kind, (decoded as any).frameId);
			this.handleAgentMessage(decoded, ev.source as Window);
		}
	}

	private handleAgentMessage(msg: DevtoolsMessage, win: Window): void {
		switch (msg.kind) {
			case 'frame-ready': {
				this.windowsByFrameId.set(msg.frameId, win);
				this.multiplexer.attachFrame({
					frameId: msg.frameId,
					parentFrameId: msg.parentFrameId,
					url: msg.url,
					title: msg.title,
					postToFrame: (cdpJson) =>
						this.sendCdpToAgent(win, msg.frameId, cdpJson),
				});
				return;
			}
			case 'frame-gone': {
				this.multiplexer.detachFrame(msg.frameId);
				this.windowsByFrameId.delete(msg.frameId);
				return;
			}
			case 'cdp-out': {
				this.multiplexer.receiveFromFrame(msg.frameId, msg.payload);
				return;
			}
			case 'agent-error': {
				console.warn(
					'[devtools] agent error from frame',
					msg.frameId,
					msg.message
				);
				return;
			}
			default:
				return;
		}
	}

	private sendCdpToAgent(
		win: Window,
		frameId: string,
		cdpJson: string
	): void {
		// Why not postMessage:
		//
		// `win` is a Scramjet-proxied iframe contentWindow. Scramjet has
		// replaced the own-property `window.postMessage` with a Proxy
		// (see scramjet/.../client/shared/postmessage.ts:9). On apply,
		// that Proxy steals `Function` from the message argument's realm,
		// gets the caller's `globalThis`, and reads
		// `globalThis[SCRAMJETCLIENT].url.origin`. The host realm has no
		// SCRAMJETCLIENT installed, so `callerClient` is undefined and
		// `callerClient.url` throws.
		//
		// We can't fall back to `Window.prototype.postMessage` either —
		// in real browsers `postMessage` is an own property of each
		// Window instance, NOT on `Window.prototype` (verified in Chrome:
		// `Window.prototype.postMessage === undefined`). There is no
		// prototype-chain native to invoke.
		//
		// Solution: skip postMessage entirely for the host -> agent leg.
		// The agent installs a direct function `__ddxDevtoolsReceive` on
		// its proxied window. Calling that function from the host crosses
		// realms cleanly — Scramjet's proxies cover specific DOM globals,
		// not arbitrary user-defined window properties. The function
		// body then runs in the proxied realm with normal access to
		// chobitsu.
		try {
			const recv = (win as unknown as {
				__ddxDevtoolsReceive?: (frameId: string, payload: string) => void;
			}).__ddxDevtoolsReceive;
			if (typeof recv !== 'function') {
				// Agent not yet installed (or window is mid-teardown).
				// Drop the message; chii will resend on reconnect.
				return;
			}
			recv(frameId, cdpJson);
		} catch (err) {
			console.warn('[ddx-devtools] sendCdpToAgent failed:', err);
		}
	}
}
