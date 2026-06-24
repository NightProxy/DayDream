import { describe, it, expect, beforeEach } from 'vitest';
import { buildClientRuntime } from '../../../src/apis/nyxBridge/client/runtime';
import { METHOD_REGISTRY, RESERVED_EVENT_PATHS } from '../../../src/apis/nyxBridge/api';

/**
 * Drain pending microtasks AND wait for a predicate. crypto.subtle.digest
 * resolves on a microtask after several ticks; a single setTimeout(0) is
 * not reliably long enough on cold jsdom.
 */
async function settle(predicate: () => boolean, timeoutMs = 200): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((r) => setTimeout(r, 1));
	}
}

describe('client runtime (buildClientRuntime)', () => {
	let target: any;
	let parentPosts: any[];
	beforeEach(() => {
		parentPosts = [];
		target = {
			parentPostMessage: (data: any) => parentPosts.push(data),
			addMessageListener: (cb: any) => { target._listener = cb; },
			HOST_MARKER: 'test-marker',
			dispatchEvent: (e: any) => { target._lastEvent = e; },
		};
		buildClientRuntime(target);
	});

	it('attaches window.ddx with all METHOD_REGISTRY methods', () => {
		for (const fullName of METHOD_REGISTRY) {
			const parts = fullName.split('.');
			let obj: any = target.ddx;
			for (let i = 0; i < parts.length - 1; i++) obj = obj?.[parts[i]];
			expect(typeof obj?.[parts[parts.length - 1]]).toBe('function');
		}
	});

	it('attaches reserved event stubs with addListener/removeListener/hasListener/hasListeners', () => {
		for (const path of RESERVED_EVENT_PATHS) {
			const parts = path.split('.');
			let obj: any = target.ddx;
			for (let i = 0; i < parts.length - 1; i++) obj = obj?.[parts[i]];
			const ev = obj?.[parts[parts.length - 1]];
			expect(ev).toBeDefined();
			expect(typeof ev.addListener).toBe('function');
			expect(typeof ev.removeListener).toBe('function');
			expect(typeof ev.hasListener).toBe('function');
			expect(typeof ev.hasListeners).toBe('function');
		}
	});

	it('attaches constants', () => {
		expect(target.ddx.tabs.TAB_ID_NONE).toBe(-1);
		expect(target.ddx.tabs.TAB_INDEX_NONE).toBe(-1);
		expect(target.ddx.windows.WINDOW_ID_NONE).toBe(-1);
		expect(target.ddx.windows.WINDOW_ID_CURRENT).toBe(-2);
	});

	it('initiates handshake on construction', async () => {
		await settle(() => parentPosts.length >= 1);
		expect(parentPosts.length).toBeGreaterThanOrEqual(1);
		const init = parentPosts[0]['__nyx_req'];
		expect(init.type).toBe('__handshake.init');
		expect(typeof init.requestId).toBe('string');
	});

	it('completes handshake on host reply and dispatches ddx:ready', async () => {
		await settle(() => parentPosts.length >= 1);
		const initReqId = parentPosts[0]['__nyx_req'].requestId;
		target._listener({
			data: { __nyx_res: { requestId: initReqId, ok: true, result: { nonce: 'abc', sessionId: 'sid-1' } } },
		});
		await settle(() => parentPosts.length >= 2);
		expect(parentPosts.length).toBe(2);
		const complete = parentPosts[1]['__nyx_req'];
		expect(complete.type).toBe('__handshake.complete');
		expect(complete.args.sessionId).toBe('sid-1');
		expect(typeof complete.args.token).toBe('string');

		const completeReqId = complete.requestId;
		target._listener({
			data: {
				__nyx_res: {
					requestId: completeReqId,
					ok: true,
					result: { ok: true, capabilities: ['tabs.get'], plusAuth: { token: 'tok' } },
				},
			},
		});
		await settle(() => target._lastEvent?.type === 'ddx:ready');
		expect(target._lastEvent?.type).toBe('ddx:ready');
		expect(target._lastEvent?.detail?.plusAuth?.token).toBe('tok');
	});

	it('method calls become __nyx_req posts and resolve on host reply', async () => {
		await settle(() => parentPosts.length >= 1);
		const initId = parentPosts[0]['__nyx_req'].requestId;
		target._listener({ data: { __nyx_res: { requestId: initId, ok: true, result: { nonce: 'n', sessionId: 'sid' } } } });
		await settle(() => parentPosts.length >= 2);
		const completeId = parentPosts[1]['__nyx_req'].requestId;
		target._listener({ data: { __nyx_res: { requestId: completeId, ok: true, result: { ok: true } } } });
		await settle(() => target._lastEvent?.type === 'ddx:ready');

		const promise = target.ddx.tabs.get(42);
		await settle(() => parentPosts.length >= 3);
		const callMsg = parentPosts[2]['__nyx_req'];
		expect(callMsg.type).toBe('tabs.get');
		expect(callMsg.sessionId).toBe('sid');
		expect(callMsg.args).toBe(42);

		target._listener({ data: { __nyx_res: { requestId: callMsg.requestId, ok: true, result: { id: 42 } } } });
		const r = await promise;
		expect(r).toEqual({ id: 42 });
	});

	it('rejected calls produce DDXError with code', async () => {
		await settle(() => parentPosts.length >= 1);
		const id1 = parentPosts[0]['__nyx_req'].requestId;
		target._listener({ data: { __nyx_res: { requestId: id1, ok: true, result: { nonce: 'n', sessionId: 's' } } } });
		await settle(() => parentPosts.length >= 2);
		const id2 = parentPosts[1]['__nyx_req'].requestId;
		target._listener({ data: { __nyx_res: { requestId: id2, ok: true, result: { ok: true } } } });
		await settle(() => target._lastEvent?.type === 'ddx:ready');

		const promise = target.ddx.tabs.get(1);
		await settle(() => parentPosts.length >= 3);
		const id3 = parentPosts[2]['__nyx_req'].requestId;
		target._listener({ data: { __nyx_res: { requestId: id3, ok: false, error: { code: 'tab_not_found', message: 'no such tab' } } } });
		await expect(promise).rejects.toMatchObject({ name: 'DDXError', code: 'tab_not_found', message: 'no such tab' });
	});
});
