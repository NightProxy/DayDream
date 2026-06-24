import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NyxChannel } from '../../src/apis/nyxBridge/channel';
import { Handshake } from '../../src/apis/nyxBridge/handshake';

const REQ = '__nyx_req';
const RES = '__nyx_res';

function fakeIframe(): HTMLIFrameElement {
	const el = document.createElement('iframe');
	const fakeWin: any = {};
	// jsdom defines contentWindow as a getter; bypass with defineProperty.
	Object.defineProperty(el, 'contentWindow', { value: fakeWin, configurable: true });
	return el;
}

function fakeSource() {
	const calls: any[] = [];
	const w: any = { postMessage(d: any) { calls.push(d); } };
	return { w, calls };
}

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Drain pending microtasks AND wait one macrotask. crypto.subtle.digest
 * resolves on a microtask after several ticks; a single `setTimeout(0)`
 * is not reliably long enough on cold jsdom. This polls a predicate
 * until satisfied (or times out).
 */
async function settle(predicate: () => boolean, timeoutMs = 200): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((r) => setTimeout(r, 1));
	}
}

describe('NyxChannel', () => {
	const HOST_MARKER = 'hostmarker';

	function buildChannel(handlers: Record<string, (args: any) => Promise<any>> = {}) {
		const handshake = new Handshake({ hostMarker: HOST_MARKER, allowlist: ['https://nyx.night-x.com'] });
		const ch = new NyxChannel({
			handshake,
			dispatchMethod: async (method, args) => {
				if (!(method in handlers)) throw new Error(`no handler ${method}`);
				return handlers[method](args);
			},
			resolveIframeForSource: (src) => {
				const iframes = document.querySelectorAll('iframe');
				for (const f of iframes) if (f.contentWindow === src) return f as HTMLIFrameElement;
				return null;
			},
			resolveRealUrl: (_iframe) => 'https://nyx.night-x.com/',
		});
		ch.registerMethods(['tabs.get', 'tabs.update']);
		ch.install();
		return { ch, handshake };
	}

	function postRequest(source: Window, requestId: string, type: string, body: Record<string, unknown> = {}) {
		const data = { [REQ]: { requestId, type, ...body } };
		window.dispatchEvent(new MessageEvent('message', { data, source } as any));
	}

	let cleanup: Array<() => void> = [];
	beforeEach(() => {
		cleanup.forEach((f) => f());
		cleanup = [];
		document.body.innerHTML = '';
	});

	it('completes handshake end-to-end', async () => {
		const iframe = fakeIframe();
		document.body.appendChild(iframe);
		const { ch } = buildChannel();
		cleanup.push(() => ch.uninstall());

		const src = fakeSource();
		Object.defineProperty(iframe, 'contentWindow', { value: src.w, configurable: true });

		postRequest(src.w, 'r1', '__handshake.init');
		await settle(() => src.calls.length >= 1);
		expect(src.calls.length).toBe(1);
		const initRes = src.calls[0][RES];
		expect(initRes.ok).toBe(true);
		const { nonce, sessionId } = initRes.result;
		const token = await sha256Hex(`${nonce}:${HOST_MARKER}:nyx-bridge-v1`);

		postRequest(src.w, 'r2', '__handshake.complete', { args: { sessionId, token } });
		await settle(() => src.calls.length >= 2);
		expect(src.calls.length).toBe(2);
		expect(src.calls[1][RES].ok).toBe(true);
	});

	it('rejects non-handshake methods without a session', async () => {
		const iframe = fakeIframe();
		document.body.appendChild(iframe);
		const { ch } = buildChannel({ 'tabs.get': async () => ({ id: 1 }) });
		cleanup.push(() => ch.uninstall());

		const src = fakeSource();
		Object.defineProperty(iframe, 'contentWindow', { value: src.w, configurable: true });

		postRequest(src.w, 'r1', 'tabs.get', { args: { tabId: 1 } });
		await settle(() => src.calls.length >= 1);
		expect(src.calls.length).toBe(1);
		expect(src.calls[0][RES].ok).toBe(false);
		expect(src.calls[0][RES].error.code).toBe('handshake_required');
	});

	it('dispatches to handler after handshake', async () => {
		const iframe = fakeIframe();
		document.body.appendChild(iframe);
		const handler = vi.fn(async (args: any) => ({ tabId: args.tabId, ok: true }));
		const { ch } = buildChannel({ 'tabs.get': handler });
		cleanup.push(() => ch.uninstall());

		const src = fakeSource();
		Object.defineProperty(iframe, 'contentWindow', { value: src.w, configurable: true });
		postRequest(src.w, 'r1', '__handshake.init');
		await settle(() => src.calls.length >= 1);
		const { nonce, sessionId } = src.calls[0][RES].result;
		const token = await sha256Hex(`${nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		postRequest(src.w, 'r2', '__handshake.complete', { args: { sessionId, token } });
		await settle(() => src.calls.length >= 2);

		postRequest(src.w, 'r3', 'tabs.get', { sessionId, args: { tabId: 42 } });
		await settle(() => src.calls.length >= 3);
		expect(handler).toHaveBeenCalledWith({ tabId: 42 });
		expect(src.calls[2][RES]).toEqual({ requestId: 'r3', ok: true, result: { tabId: 42, ok: true } });
	});

	it('serializes ops against the same tabId', async () => {
		const iframe = fakeIframe();
		document.body.appendChild(iframe);
		const order: string[] = [];
		const handler = vi.fn(async (args: any) => {
			order.push(`enter:${args.label}`);
			await new Promise((r) => setTimeout(r, 5));
			order.push(`exit:${args.label}`);
			return args.label;
		});
		const { ch } = buildChannel({ 'tabs.update': handler });
		cleanup.push(() => ch.uninstall());

		const src = fakeSource();
		Object.defineProperty(iframe, 'contentWindow', { value: src.w, configurable: true });
		postRequest(src.w, 'r1', '__handshake.init');
		await settle(() => src.calls.length >= 1);
		const { nonce, sessionId } = src.calls[0][RES].result;
		const token = await sha256Hex(`${nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		postRequest(src.w, 'r2', '__handshake.complete', { args: { sessionId, token } });
		await settle(() => src.calls.length >= 2);

		postRequest(src.w, 'a', 'tabs.update', { sessionId, args: { tabId: 1, label: 'A' } });
		postRequest(src.w, 'b', 'tabs.update', { sessionId, args: { tabId: 1, label: 'B' } });
		await settle(() => order.length >= 4, 500);
		expect(order).toEqual(['enter:A', 'exit:A', 'enter:B', 'exit:B']);
	});

	it('rejects unknown methods', async () => {
		const iframe = fakeIframe();
		document.body.appendChild(iframe);
		const { ch } = buildChannel({});
		cleanup.push(() => ch.uninstall());

		const src = fakeSource();
		Object.defineProperty(iframe, 'contentWindow', { value: src.w, configurable: true });
		postRequest(src.w, 'r1', '__handshake.init');
		await settle(() => src.calls.length >= 1);
		const { nonce, sessionId } = src.calls[0][RES].result;
		const token = await sha256Hex(`${nonce}:${HOST_MARKER}:nyx-bridge-v1`);
		postRequest(src.w, 'r2', '__handshake.complete', { args: { sessionId, token } });
		await settle(() => src.calls.length >= 2);

		postRequest(src.w, 'r3', 'tabs.totallyMadeUp', { sessionId });
		await settle(() => src.calls.length >= 3);
		expect(src.calls[2][RES].ok).toBe(false);
	});
});
