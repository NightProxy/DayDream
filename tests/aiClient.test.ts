import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIClient } from '@apis/ai';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

function makeSSEResponse(chunks: string[]): Response {
	const enc = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
			controller.close();
		},
	});
	return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function deltaChunk(content: string): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const x of iter) out.push(x);
	return out;
}

function newClient(seed?: Partial<{ aiProviderUrl: string; aiApiKey: string; aiModel: string; aiStreaming: boolean }>): AIClient {
	const s = new FakeSettings();
	if (seed?.aiProviderUrl !== undefined) s._set('aiProviderUrl', seed.aiProviderUrl);
	if (seed?.aiApiKey !== undefined) s._set('aiApiKey', seed.aiApiKey);
	if (seed?.aiModel !== undefined) s._set('aiModel', seed.aiModel);
	if (seed?.aiStreaming !== undefined) s._set('aiStreaming', seed.aiStreaming);
	return new AIClient(s as unknown as SettingsAPI);
}

describe('AIClient', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('isConfigured returns false when URL is empty', async () => {
		const c = newClient();
		await c.reloadConfig();
		expect(c.isConfigured()).toBe(false);
	});

	it('isConfigured returns true when URL is set', async () => {
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		expect(c.isConfigured()).toBe(true);
	});

	it('stream throws clearly when unconfigured', async () => {
		const c = newClient();
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('hi', ctrl.signal)) {
				void _;
			}
		}).rejects.toThrow(/not configured/i);
	});

	it('streaming happy path: 3 SSE deltas yield 3 strings', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSSEResponse([
			deltaChunk('hel'),
			deltaChunk('lo '),
			deltaChunk('world'),
			'data: [DONE]\n\n',
		])));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1', aiStreaming: true });
		await c.reloadConfig();
		const ctrl = new AbortController();
		const out = await collect(c.stream('test', ctrl.signal));
		expect(out).toEqual(['hel', 'lo ', 'world']);
	});

	it('non-stream mode yields a single chunk', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
			JSON.stringify({ choices: [{ message: { content: 'full response' } }] }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1', aiStreaming: false });
		await c.reloadConfig();
		const ctrl = new AbortController();
		const out = await collect(c.stream('test', ctrl.signal));
		expect(out).toEqual(['full response']);
	});

	it('throws typed error on HTTP 401', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {
				void _;
			}
		}).rejects.toThrow(/401|key|auth/i);
	});

	it('throws typed error on HTTP 429', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too Many', { status: 429 })));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {
				void _;
			}
		}).rejects.toThrow(/429|rate/i);
	});

	it('throws typed error on network failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		const c = newClient({ aiProviderUrl: 'https://api.openai.com/v1' });
		await c.reloadConfig();
		const ctrl = new AbortController();
		await expect(async () => {
			for await (const _ of c.stream('test', ctrl.signal)) {
				void _;
			}
		}).rejects.toThrow();
	});
});
