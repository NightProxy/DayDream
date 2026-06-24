// src/apis/nyxBridge/client/runtime.ts
//
// Source of the script injected into NyxAI iframes. Bundled to an IIFE
// by client/rolldown.config.ts. The IIFE wrapper at inject time supplies
// HOST_MARKER as a closure constant. We expose a `buildClientRuntime`
// function for unit testing — production simply calls `bootClient()` at
// the bottom of the file.

import { METHOD_REGISTRY, RESERVED_EVENT_PATHS } from '../api';

export interface RuntimeTarget {
	parentPostMessage: (data: unknown) => void;
	addMessageListener: (cb: (ev: { data: unknown }) => void) => void;
	dispatchEvent: (e: { type: string; detail?: unknown }) => void;
	HOST_MARKER: string;
	ddx?: any;
	/**
	 * Set by the runtime after handshake completes (or fails) so
	 * consumers that subscribe to `ddx:ready` AFTER the event has
	 * already fired can still detect the bridge is up. Value is the
	 * detail payload on success, or `false` on handshake error.
	 */
	__ddxReady?: unknown;
}

const REQ_MARKER = '__nyx_req';
const RES_MARKER = '__nyx_res';
const TOKEN_PREFIX = 'nyx-bridge-v1';

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

class DDXClientError extends Error {
	override name = 'DDXError' as const;
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

export function buildClientRuntime(target: RuntimeTarget): void {
	let sessionId: string | null = null;
	let nextRequestId = 1;
	const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

	function rpc(method: string, args?: unknown): Promise<any> {
		const requestId = `r-${nextRequestId++}`;
		return new Promise((resolve, reject) => {
			pending.set(requestId, { resolve, reject });
			target.parentPostMessage({
				[REQ_MARKER]: { requestId, type: method, sessionId: sessionId ?? undefined, args },
			});
		});
	}

	function deliverReply(res: any): void {
		if (!res || typeof res !== 'object') return;
		const p = pending.get(res.requestId);
		if (!p) return;
		pending.delete(res.requestId);
		if (res.ok) {
			p.resolve(res.result);
		} else {
			const errInfo = res.error;
			if (errInfo && typeof errInfo === 'object' && 'code' in errInfo) {
				p.reject(new DDXClientError((errInfo as any).code, (errInfo as any).message ?? 'error'));
			} else {
				p.reject(new DDXClientError('cdp_error', String(errInfo ?? 'error')));
			}
		}
	}

	// Path 1: postMessage-based replies (used by tests / non-scramjet
	// realms where the host can safely call `iframe.contentWindow.
	// postMessage`).
	target.addMessageListener((ev) => {
		const data = (ev?.data as any) ?? null;
		const res = data?.[RES_MARKER];
		if (res) deliverReply(res);
	});

	// Path 2: CustomEvent-based replies (used in production scramjet-
	// proxied frames where scramjet's `postMessage` wrapper crashes when
	// called from outside the proxied realm — see channel.ts
	// replyTransport for the full story). The host dispatches an
	// `__nyx_res` CustomEvent directly onto this window from the host
	// realm. The `detail` payload is the same shape we'd have received
	// under `event.data.__nyx_res` via postMessage.
	if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
		window.addEventListener(RES_MARKER, (ev: Event) => {
			const detail = (ev as CustomEvent).detail;
			if (detail) deliverReply(detail);
		});
	}

	function buildEvent() {
		const listeners = new Set<Function>();
		return {
			addListener(cb: Function) { listeners.add(cb); },
			removeListener(cb: Function) { listeners.delete(cb); },
			hasListener(cb: Function) { return listeners.has(cb); },
			hasListeners() { return listeners.size > 0; },
		};
	}

	function setNested(root: any, path: string, value: unknown): void {
		const parts = path.split('.');
		let obj = root;
		for (let i = 0; i < parts.length - 1; i++) {
			obj[parts[i]] ??= {};
			obj = obj[parts[i]];
		}
		obj[parts[parts.length - 1]] = value;
	}

	const ddx: any = {};
	for (const fullName of METHOD_REGISTRY) {
		const fn = (...args: any[]) => rpc(fullName, args.length === 0 ? undefined : args.length === 1 ? args[0] : args);
		setNested(ddx, fullName, fn);
	}
	for (const evPath of RESERVED_EVENT_PATHS) {
		setNested(ddx, evPath, buildEvent());
	}
	ddx.tabs ??= {};
	ddx.tabs.TAB_ID_NONE = -1;
	ddx.tabs.TAB_INDEX_NONE = -1;
	ddx.windows ??= {};
	ddx.windows.WINDOW_ID_NONE = -1;
	ddx.windows.WINDOW_ID_CURRENT = -2;
	target.ddx = ddx;

	(async () => {
		try {
			const r1 = await rpc('__handshake.init');
			const token = await sha256Hex(`${r1.nonce}:${target.HOST_MARKER}:${TOKEN_PREFIX}`);
			const r2 = await rpc('__handshake.complete', { sessionId: r1.sessionId, token });
			sessionId = r1.sessionId;
			const detail = { capabilities: r2.capabilities, plusAuth: r2.plusAuth, sessionId };
			// Stash the ready state on window so consumers that subscribe
			// AFTER the event has fired can still detect it. Without this,
			// any code that registers `addEventListener('ddx:ready', ...)`
			// after handshake completes never resolves — the event has
			// already fired and gone. NyxAI's MessageSender hits this when
			// it lazy-checks the bridge on the first user turn.
			try {
				(target as { __ddxReady?: unknown }).__ddxReady = detail;
				if (typeof (globalThis as any).window !== 'undefined' && (globalThis as any).window !== target) {
					(globalThis as any).window.__ddxReady = detail;
				}
			} catch { /* defensive — never let a window-write block ready dispatch */ }
			target.dispatchEvent({ type: 'ddx:ready', detail });
		} catch (e) {
			const errDetail = { error: String((e as Error)?.message ?? e) };
			try {
				(target as { __ddxReady?: unknown }).__ddxReady = false;
			} catch { /* ignore */ }
			target.dispatchEvent({ type: 'ddx:error', detail: errDetail });
		}
	})();
}

/**
 * Production entry. Called by the IIFE wrapper that injects HOST_MARKER.
 * Runs at document_start in the NyxAI iframe.
 */
export function bootClient(): void {
	const HOST_MARKER = (globalThis as any).__NYX_HOST_MARKER as string;
	if (!HOST_MARKER) {
		console.error('[nyx-bridge-client] missing HOST_MARKER; bridge will not initialize');
		return;
	}
	const target: RuntimeTarget = {
		HOST_MARKER,
		parentPostMessage: (data) => window.parent.postMessage(data, '*'),
		addMessageListener: (cb) => window.addEventListener('message', cb as any),
		dispatchEvent: (e) => window.dispatchEvent(new CustomEvent(e.type, { detail: e.detail })),
	};
	buildClientRuntime(target);
	// CRITICAL: buildClientRuntime sets target.ddx — but NyxAI consumes
	// window.ddx (and so does our own type declaration). Mirror it.
	// Without this, isBridgeAvailable() returns false and agentic mode
	// silently disables.
	(window as { ddx?: unknown }).ddx = target.ddx;
}

// Auto-boot in production. The conditional check prevents boot during
// unit tests (no __NYX_HOST_MARKER) and during SSR (no window).
if (typeof window !== 'undefined' && (globalThis as any).__NYX_HOST_MARKER) {
	bootClient();
}
