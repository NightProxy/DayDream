import './helpers/opfsStub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CaptchaBridge } from '@apis/captcha';
import { REQ_MARKER, RES_MARKER, HOOK_READY_MARKER } from '@apis/captcha';

function makeFakeSource() {
	const calls: Array<{ data: unknown }> = [];
	return {
		postMessage(data: unknown) {
			calls.push({ data });
		},
		_calls: calls
	} as unknown as Window & { _calls: Array<{ data: unknown }> };
}

function postSolve(req: Record<string, unknown>) {
	const source = makeFakeSource();
	window.dispatchEvent(
		new MessageEvent('message', {
			data: { [REQ_MARKER]: req },
			source
		})
	);
	return source as unknown as { _calls: Array<{ data: { [k: string]: unknown } }> };
}

async function tick() {
	await new Promise((r) => setTimeout(r, 0));
}

describe('CaptchaBridge — gate', () => {
	let bridge: CaptchaBridge;
	let teardown: (() => void) | null = null;

	afterEach(() => {
		if (teardown) {
			teardown();
			teardown = null;
		}
	});

	it('replies with unauthorized when checkNightPlusStatus is false', async () => {
		const solveSpy = vi.fn();
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => false,
			solveCaptcha: solveSpy
		});
		teardown = bridge.install();

		const source = postSolve({
			requestId: 'r1',
			type: 'turnstile',
			sitekey: '0xABC',
			pageUrl: 'https://example.com'
		});
		await tick();

		expect(solveSpy).not.toHaveBeenCalled();
		const reply = source._calls[0]!.data[RES_MARKER] as {
			ok: boolean;
			error: string;
		};
		expect(reply.ok).toBe(false);
		expect(reply.error).toBe('unauthorized');

		expect(bridge.getStats().unauthorizedCount).toBe(1);
		expect(bridge.getStats().byType.turnstile).toEqual({
			requested: 1,
			solved: 0,
			failed: 1
		});
	});

	it('calls solver and replies with token when authed', async () => {
		const solveSpy = vi.fn().mockResolvedValue('the-token');
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: solveSpy
		});
		teardown = bridge.install();

		const source = postSolve({
			requestId: 'r2',
			type: 'hcaptcha',
			sitekey: '0xDEF',
			pageUrl: 'https://h.example.com'
		});
		await tick();

		expect(solveSpy).toHaveBeenCalledOnce();
		const reply = source._calls[0]!.data[RES_MARKER] as {
			ok: boolean;
			result: string;
		};
		expect(reply.ok).toBe(true);
		expect(reply.result).toBe('the-token');

		expect(bridge.getStats().byType.hcaptcha).toEqual({
			requested: 1,
			solved: 1,
			failed: 0
		});
	});

	it('forwards solver errors as the reply error code', async () => {
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: async () => {
				throw new Error('endpoint_not_found');
			}
		});
		teardown = bridge.install();

		const source = postSolve({
			requestId: 'r3',
			type: 'recaptcha-v3',
			sitekey: '6Lc...',
			pageUrl: 'https://example.com'
		});
		await tick();

		const reply = source._calls[0]!.data[RES_MARKER] as {
			ok: boolean;
			error: string;
		};
		expect(reply.ok).toBe(false);
		expect(reply.error).toBe('endpoint_not_found');
		expect(bridge.getStats().byType['recaptcha-v3']).toEqual({
			requested: 1,
			solved: 0,
			failed: 1
		});
	});

	it('ignores host-self-source spoofs even when authed', async () => {
		const solveSpy = vi.fn().mockResolvedValue('x');
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: solveSpy
		});
		teardown = bridge.install();

		// event.source === window → channel rejects before our handler runs
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					[REQ_MARKER]: {
						requestId: 'r4',
						type: 'turnstile',
						sitekey: 'spoof',
						pageUrl: 'https://evil'
					}
				},
				source: window
			})
		);
		await tick();
		expect(solveSpy).not.toHaveBeenCalled();
	});

	it('counts hook-ready pings without throwing', async () => {
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: async () => 'tok'
		});
		teardown = bridge.install();

		// hook-ready is fire-and-forget — needs a non-window source.
		const source = makeFakeSource();
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					[HOOK_READY_MARKER]: {
						pageUrl: 'https://x',
						at: Date.now()
					}
				},
				source
			})
		);
		await tick();
		expect(bridge.getStats().hookReadyCount).toBe(1);
	});

	it('replies via MessagePort when the hook-ready handshake provides one', async () => {
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: async () => 'port-token'
		});
		teardown = bridge.install();

		// Simulate the in-page hook's port handshake. Use a real
		// MessageChannel so port.postMessage round-trips correctly to
		// our captured listener on port1.
		const channel = new MessageChannel();
		const portReceived: unknown[] = [];
		channel.port1.addEventListener('message', (e) => {
			portReceived.push(e.data);
		});
		channel.port1.start();

		const source = makeFakeSource();
		// Synthesize the hook-ready event WITH a port in the transfer
		// list. MessageEvent constructor accepts `ports` as init.
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					[HOOK_READY_MARKER]: { pageUrl: 'https://x', at: Date.now() }
				},
				source,
				ports: [channel.port2]
			})
		);
		await tick();

		// Now post a solve from the SAME source; reply should arrive on port1.
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					[REQ_MARKER]: {
						requestId: 'port-r',
						type: 'turnstile',
						sitekey: 'k',
						pageUrl: 'https://x'
					}
				},
				source
			})
		);

		// Allow async dispatch and port message delivery (a microtask
		// per hop, plus port delivery is itself a task).
		await tick();
		await new Promise((r) => setTimeout(r, 5));

		// The reply should have landed on port1, not on source.postMessage.
		expect(portReceived.length).toBe(1);
		const wrapped = portReceived[0] as { [k: string]: unknown };
		const reply = wrapped[RES_MARKER] as {
			ok: boolean;
			result: string;
		};
		expect(reply.ok).toBe(true);
		expect(reply.result).toBe('port-token');

		// Source.postMessage should NOT have been called (we used the port).
		const directCalls = (
			source as unknown as { _calls: unknown[] }
		)._calls;
		expect(directCalls.length).toBe(0);
	});

	it('handles scramjet-wrapped hook-ready and solve envelopes', async () => {
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: async () => 'sj-token'
		});
		teardown = bridge.install();

		// Real channel for the port handshake (port gets received from
		// `event.ports`, which `MessageEvent` init supports independently
		// of the `data` envelope wrapping).
		const channel = new MessageChannel();
		const portReceived: unknown[] = [];
		channel.port1.addEventListener('message', (e) => {
			portReceived.push(e.data);
		});
		channel.port1.start();

		const source = makeFakeSource();

		// Hook-ready arrives wrapped in scramjet's envelope (proxied
		// page → host postMessage gets `$scramjet$messagetype` etc.).
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					$scramjet$messagetype: 'window',
					$scramjet$origin: 'https://proxied.example.com',
					$scramjet$data: {
						[HOOK_READY_MARKER]: {
							pageUrl: 'https://proxied.example.com/',
							at: Date.now()
						}
					}
				},
				source,
				ports: [channel.port2]
			})
		);
		await tick();
		expect(bridge.getStats().hookReadyCount).toBe(1);

		// Solve request also arrives wrapped.
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					$scramjet$messagetype: 'window',
					$scramjet$origin: 'https://proxied.example.com',
					$scramjet$data: {
						[REQ_MARKER]: {
							requestId: 'sj-r1',
							type: 'turnstile',
							sitekey: '0xABCDEF',
							pageUrl: 'https://proxied.example.com/login'
						}
					}
				},
				source
			})
		);
		await tick();
		await new Promise((r) => setTimeout(r, 5));

		// Reply lands on the port; the wrapped solve was unwrapped, the
		// handler ran, and the token came back via the per-source port.
		expect(portReceived.length).toBe(1);
		const wrapped = portReceived[0] as { [k: string]: unknown };
		const reply = wrapped[RES_MARKER] as { ok: boolean; result: string };
		expect(reply.ok).toBe(true);
		expect(reply.result).toBe('sj-token');

		// Stats reflect the solve.
		expect(bridge.getStats().byType.turnstile).toEqual({
			requested: 1,
			solved: 1,
			failed: 0
		});
	});

	it('exposes pending solves while in flight', async () => {
		let resolveSolver: (s: string) => void = () => {};
		const slowPromise = new Promise<string>((r) => {
			resolveSolver = r;
		});
		bridge = new CaptchaBridge({
			checkNightPlusStatus: async () => true,
			solveCaptcha: () => slowPromise
		});
		teardown = bridge.install();

		postSolve({
			requestId: 'pending-r',
			type: 'turnstile',
			sitekey: 'k',
			pageUrl: 'https://e'
		});
		await tick();

		const pending = bridge.getPending();
		expect(pending.length).toBe(1);
		expect(pending[0]!.requestId).toBe('pending-r');
		expect(pending[0]!.type).toBe('turnstile');

		resolveSolver('done');
		await tick();
		expect(bridge.getPending().length).toBe(0);
	});
});
