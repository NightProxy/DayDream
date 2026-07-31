
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

	target.addMessageListener((ev) => {
		const data = (ev?.data as any) ?? null;
		const res = data?.[RES_MARKER];
		if (res) deliverReply(res);
	});

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
	(window as { ddx?: unknown }).ddx = target.ddx;
}

if (typeof window !== 'undefined' && (globalThis as any).__NYX_HOST_MARKER) {
	bootClient();
}
