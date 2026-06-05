/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('chobitsu', () => {
	const handlers = new Map<string, (msg: string) => void>();
	const chobitsu = {
		setOnMessage: (fn: (m: string) => void) => {
			handlers.set('out', fn);
		},
		sendRawMessage: vi.fn(),
		__emit: (m: string) => handlers.get('out')?.(m),
	};
	return { default: chobitsu };
});

let parentPostSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	parentPostSpy = vi.fn();
	Object.defineProperty(window.parent, 'postMessage', {
		configurable: true,
		writable: true,
		value: parentPostSpy,
	});
	sessionStorage.clear();
	const chobitsuMod = await import('chobitsu');
	(chobitsuMod.default as any).sendRawMessage.mockClear();
});

afterEach(() => {
	vi.resetModules();
});

describe('per-frame agent', () => {
	it('posts frame-ready on boot', async () => {
		document.title = 'My Page';
		const { bootAgent } = await import('./index');
		bootAgent();
		expect(parentPostSpy).toHaveBeenCalled();
		const env = parentPostSpy.mock.calls[0][0];
		expect(env.$scramjet$messagetype).toBe('window');
		const data = env.$scramjet$data;
		expect(data.kind).toBe('frame-ready');
		expect(data.frameId).toMatch(/.+/);
		expect(data.title).toBe('My Page');
	});

	it('persists frameId in sessionStorage across boots', async () => {
		const { bootAgent } = await import('./index');
		bootAgent();
		const firstId = parentPostSpy.mock.calls[0][0].$scramjet$data.frameId;
		parentPostSpy.mockClear();
		vi.resetModules();
		const reloaded = await import('./index');
		reloaded.bootAgent();
		const secondId =
			parentPostSpy.mock.calls[0][0].$scramjet$data.frameId;
		expect(secondId).toBe(firstId);
	});

	it('forwards chobitsu output as cdp-out', async () => {
		const { bootAgent } = await import('./index');
		const chobitsuMod = await import('chobitsu');
		bootAgent();
		parentPostSpy.mockClear();
		(chobitsuMod.default as any).__emit('{"id":1,"result":{}}');
		const env = parentPostSpy.mock.calls[0][0];
		expect(env.$scramjet$data.kind).toBe('cdp-out');
		expect(env.$scramjet$data.payload).toBe('{"id":1,"result":{}}');
	});

	it('exposes __ddxDevtoolsReceive that forwards CDP into chobitsu for this frame', async () => {
		const { bootAgent } = await import('./index');
		const chobitsuMod = await import('chobitsu');
		bootAgent();
		const frameId = parentPostSpy.mock.calls[0][0].$scramjet$data.frameId;
		const recv = (window as unknown as {
			__ddxDevtoolsReceive?: (id: string, p: string) => void;
		}).__ddxDevtoolsReceive;
		expect(typeof recv).toBe('function');
		recv!(frameId, '{"id":7}');
		expect(
			(chobitsuMod.default as any).sendRawMessage
		).toHaveBeenCalledWith('{"id":7}');
	});

	it('__ddxDevtoolsReceive ignores payloads addressed to a different frame', async () => {
		const { bootAgent } = await import('./index');
		const chobitsuMod = await import('chobitsu');
		bootAgent();
		const recv = (window as unknown as {
			__ddxDevtoolsReceive?: (id: string, p: string) => void;
		}).__ddxDevtoolsReceive;
		expect(typeof recv).toBe('function');
		recv!('someone-else', '{"id":7}');
		expect(
			(chobitsuMod.default as any).sendRawMessage
		).not.toHaveBeenCalled();
	});
});
