import { describe, expect, it, vi } from 'vitest';
import { CdpMultiplexer } from './multiplexer';

function parseAll(spy: ReturnType<typeof vi.fn>): any[] {
	return spy.mock.calls.map((args) => JSON.parse(args[0] as string));
}

describe('CdpMultiplexer — Target domain', () => {
	it('responds to Target.getTargets with current frames', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		const postToFrame = vi.fn();
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'https://example.com/',
			title: 'Example',
			postToFrame,
		});
		mux.attachFrame({
			frameId: 'child',
			parentFrameId: 'top',
			url: 'https://child.test/',
			title: 'Child',
			postToFrame: vi.fn(),
		});

		mux.receiveFromDevTools(
			JSON.stringify({ id: 1, method: 'Target.getTargets' })
		);

		const out = parseAll(postToDevTools);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe(1);
		expect(out[0].result.targetInfos).toHaveLength(2);
		const top = out[0].result.targetInfos.find(
			(t: any) => t.targetId === 'top'
		);
		expect(top.type).toBe('page');
		expect(top.attached).toBe(false);
		const child = out[0].result.targetInfos.find(
			(t: any) => t.targetId === 'child'
		);
		expect(child.type).toBe('iframe');
	});

	it('attachToTarget mints a sessionId and emits attachedToTarget', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});

		mux.receiveFromDevTools(
			JSON.stringify({
				id: 7,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);

		const out = parseAll(postToDevTools);
		const reply = out.find((m) => m.id === 7);
		expect(reply.result.sessionId).toMatch(/.+/);
		const event = out.find((m) => m.method === 'Target.attachedToTarget');
		expect(event).toBeDefined();
		expect(event.params.sessionId).toBe(reply.result.sessionId);
		expect(event.params.targetInfo.targetId).toBe('top');
	});

	it('setDiscoverTargets emits targetCreated for existing frames', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 2,
				method: 'Target.setDiscoverTargets',
				params: { discover: true },
			})
		);
		const out = parseAll(postToDevTools);
		expect(out.find((m) => m.id === 2)).toBeDefined();
		expect(
			out.find(
				(m) =>
					m.method === 'Target.targetCreated' &&
					m.params.targetInfo.targetId === 'top'
			)
		).toBeDefined();
	});

	it('detachFromTarget cleans up sessions', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);
		const sessionId = parseAll(postToDevTools).find((m) => m.id === 1).result
			.sessionId;
		postToDevTools.mockClear();
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 2,
				method: 'Target.detachFromTarget',
				params: { sessionId },
			})
		);
		const out = parseAll(postToDevTools);
		expect(out.find((m) => m.id === 2)).toBeDefined();
		expect(
			out.find((m) => m.method === 'Target.detachedFromTarget')
		).toBeDefined();
	});

	it('closeTarget acks with success false', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 5,
				method: 'Target.closeTarget',
				params: { targetId: 'top' },
			})
		);
		const out = parseAll(postToDevTools);
		expect(out.find((m) => m.id === 5).result).toEqual({ success: false });
	});
});

describe('CdpMultiplexer — message routing', () => {
	it('routes sessionId-prefixed messages to the right frame, stripping sessionId', () => {
		const postToDevTools = vi.fn();
		const topPost = vi.fn();
		const childPost = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: topPost,
		});
		mux.attachFrame({
			frameId: 'child',
			parentFrameId: 'top',
			url: 'u',
			title: 't',
			postToFrame: childPost,
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'child' },
			})
		);
		const sessionId = JSON.parse(postToDevTools.mock.calls[0][0]).result
			.sessionId;
		mux.receiveFromDevTools(
			JSON.stringify({
				sessionId,
				id: 2,
				method: 'DOM.getDocument',
				params: {},
			})
		);
		expect(childPost).toHaveBeenCalledTimes(1);
		const forwarded = JSON.parse(childPost.mock.calls[0][0]);
		expect(forwarded.method).toBe('DOM.getDocument');
		expect(forwarded.sessionId).toBeUndefined();
		expect(topPost).not.toHaveBeenCalled();
	});

	it('routes sessionless messages to top-level frame', () => {
		const postToDevTools = vi.fn();
		const topPost = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: topPost,
		});
		mux.receiveFromDevTools(
			JSON.stringify({ id: 1, method: 'Runtime.enable' })
		);
		expect(topPost).toHaveBeenCalledTimes(1);
	});

	it('forwards a request with sessionId to its frame and wraps the response with the same sessionId', () => {
		const postToFrame = vi.fn();
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame,
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);
		const sessionId = JSON.parse(postToDevTools.mock.calls[0][0]).result
			.sessionId;
		postToDevTools.mockClear();
		// DT issues a real CDP request through that session.
		mux.receiveFromDevTools(
			JSON.stringify({ id: 2, method: 'DOM.enable', sessionId })
		);
		// Frame replies with the same id; the multiplexer must restamp
		// sessionId so DT can route the response.
		mux.receiveFromFrame('top', JSON.stringify({ id: 2, result: { ok: 1 } }));
		const out = JSON.parse(postToDevTools.mock.calls[0][0]);
		expect(out.sessionId).toBe(sessionId);
		expect(out.id).toBe(2);
	});

	it('forwards sessionless requests to the top-level frame and emits sessionless responses', () => {
		const postToFrame = vi.fn();
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame,
		});
		// Even with an attached session, top-level (sessionless) replies
		// must NOT carry a sessionId — DT routes them off the root
		// connection.
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 5,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);
		postToDevTools.mockClear();
		mux.receiveFromDevTools(
			JSON.stringify({ id: 7, method: 'Network.enable' })
		);
		mux.receiveFromFrame('top', JSON.stringify({ id: 7, result: {} }));
		const out = JSON.parse(postToDevTools.mock.calls[0][0]);
		expect(out.id).toBe(7);
		expect('sessionId' in out).toBe(false);
	});

	it('stamps sessionId onto spontaneous events from an attached frame', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);
		const sessionId = JSON.parse(postToDevTools.mock.calls[0][0]).result
			.sessionId;
		postToDevTools.mockClear();
		// No id => event.
		mux.receiveFromFrame(
			'top',
			JSON.stringify({ method: 'Network.requestWillBeSent', params: {} })
		);
		const out = JSON.parse(postToDevTools.mock.calls[0][0]);
		expect(out.sessionId).toBe(sessionId);
		expect(out.method).toBe('Network.requestWillBeSent');
	});
});

describe('CdpMultiplexer — frame teardown', () => {
	it('detachFrame emits detached + destroyed', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'top' },
			})
		);
		postToDevTools.mockClear();
		mux.detachFrame('top');
		const out = postToDevTools.mock.calls.map((c) => JSON.parse(c[0]));
		expect(
			out.find((m) => m.method === 'Target.detachedFromTarget')
		).toBeDefined();
		expect(
			out.find((m) => m.method === 'Target.targetDestroyed')
		).toBeDefined();
	});
});

describe('CdpMultiplexer — auto-attach semantics', () => {
	it('does NOT auto-attach the top-level frame when DT enables auto-attach', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 22,
				method: 'Target.setAutoAttach',
				params: { autoAttach: true, flatten: true },
			})
		);
		const out = parseAll(postToDevTools);
		// Response (id 22) only — no Target.attachedToTarget event
		// because the top-level frame is the connection target, not
		// a child auto-attach target.
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe(22);
		expect(
			out.find((m) => m.method === 'Target.attachedToTarget')
		).toBeUndefined();
	});

	it('auto-attaches sub-frames when they appear', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.setAutoAttach',
				params: { autoAttach: true, flatten: true },
			})
		);
		postToDevTools.mockClear();
		mux.attachFrame({
			frameId: 'child',
			parentFrameId: 'top',
			url: 'c',
			title: 'c',
			postToFrame: vi.fn(),
		});
		const out = parseAll(postToDevTools);
		const attached = out.find(
			(m) => m.method === 'Target.attachedToTarget'
		);
		expect(attached).toBeDefined();
		expect(attached.params.targetInfo.targetId).toBe('child');
	});
});

describe('CdpMultiplexer — Target.* response sessionId routing', () => {
	it('stamps sessionId onto a sessioned Target.setAutoAttach response', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.attachFrame({
			frameId: 'child',
			parentFrameId: 'top',
			url: 'c',
			title: 'c',
			postToFrame: vi.fn(),
		});
		// Open a child session.
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 1,
				method: 'Target.attachToTarget',
				params: { targetId: 'child' },
			})
		);
		const childSession = JSON.parse(postToDevTools.mock.calls[0][0])
			.result.sessionId as string;
		postToDevTools.mockClear();
		// DT issues `Target.setAutoAttach` over that child session.
		// The response must echo `sessionId` so DT routes it correctly.
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 55,
				method: 'Target.setAutoAttach',
				params: { autoAttach: true },
				sessionId: childSession,
			})
		);
		const reply = JSON.parse(postToDevTools.mock.calls[0][0]);
		expect(reply.id).toBe(55);
		expect(reply.sessionId).toBe(childSession);
	});

	it('does not stamp sessionId onto sessionless Target.* responses', () => {
		const postToDevTools = vi.fn();
		const mux = new CdpMultiplexer({ postToDevTools });
		mux.attachFrame({
			frameId: 'top',
			parentFrameId: null,
			url: 'u',
			title: 't',
			postToFrame: vi.fn(),
		});
		mux.receiveFromDevTools(
			JSON.stringify({
				id: 23,
				method: 'Target.setDiscoverTargets',
				params: { discover: true },
			})
		);
		const reply = parseAll(postToDevTools).find((m) => m.id === 23);
		expect(reply).toBeDefined();
		expect('sessionId' in reply).toBe(false);
	});
});
