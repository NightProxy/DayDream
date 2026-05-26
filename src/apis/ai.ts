import { SettingsAPI } from '@apis/settings';

export interface AIConfig {
	url: string;
	apiKey: string;
	model: string;
	streaming: boolean;
}

const DEFAULT_MODEL = 'gpt-3.5-turbo';

export class AIClient {
	private cfg: AIConfig = { url: '', apiKey: '', model: DEFAULT_MODEL, streaming: true };

	constructor(private settings: SettingsAPI) {}

	async reloadConfig(): Promise<void> {
		const url = (await this.settings.getItem<string>('aiProviderUrl')) || '';
		const apiKey = (await this.settings.getItem<string>('aiApiKey')) || '';
		const model = (await this.settings.getItem<string>('aiModel')) || DEFAULT_MODEL;
		const streamingRaw = await this.settings.getItem<unknown>('aiStreaming');
		const streaming = streamingRaw === undefined || streamingRaw === null ? true : !!streamingRaw;
		this.cfg = { url, apiKey, model, streaming };
	}

	isConfigured(): boolean {
		return !!this.cfg.url;
	}

	getConfig(): AIConfig {
		return { ...this.cfg };
	}

	async test(): Promise<{ ok: true } | { ok: false; error: string }> {
		if (!this.isConfigured()) return { ok: false, error: 'AI provider not configured.' };
		try {
			const ctrl = new AbortController();
			const iter = this.stream('ping', ctrl.signal);
			const asyncIter = iter[Symbol.asyncIterator]();
			const first = await asyncIter.next();
			// Close the generator so the underlying fetch reader is cancelled
			// (triggers the streamSSE finally block). Then abort the signal as
			// belt-and-suspenders for any in-flight network work.
			try { await asyncIter.return?.(undefined); } catch { /* generator already closed */ }
			ctrl.abort();
			if (first.done) return { ok: false, error: 'Provider returned no content.' };
			return { ok: true };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	stream(prompt: string, signal: AbortSignal): AsyncIterable<string> {
		if (!this.isConfigured()) {
			throw new Error('AI provider not configured. Open Settings to add one.');
		}
		const cfg = this.cfg;
		const endpoint = cfg.url.trim().replace(/\/$/, '') + '/chat/completions';
		const body = JSON.stringify({
			model: cfg.model || DEFAULT_MODEL,
			messages: [{ role: 'user', content: prompt }],
			stream: cfg.streaming,
		});
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
		return cfg.streaming
			? this.streamSSE(endpoint, headers, body, signal)
			: this.streamSingle(endpoint, headers, body, signal);
	}

	private async *streamSSE(
		endpoint: string,
		headers: Record<string, string>,
		body: string,
		signal: AbortSignal,
	): AsyncGenerator<string> {
		const res = await fetch(endpoint, { method: 'POST', headers, body, signal });
		this.assertOk(res);
		const reader = res.body?.getReader();
		if (!reader) return;
		const dec = new TextDecoder();
		let buf = '';
		try {
			while (true) {
				if (signal.aborted) return;
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				let idx: number;
				while ((idx = buf.indexOf('\n\n')) >= 0) {
					const event = buf.slice(0, idx);
					buf = buf.slice(idx + 2);
					for (const line of event.split('\n')) {
						const trimmed = line.trim();
						if (!trimmed.startsWith('data:')) continue;
						const payload = trimmed.slice(5).trim();
						if (payload === '[DONE]') return;
						try {
							const parsed = JSON.parse(payload);
							const delta = parsed?.choices?.[0]?.delta?.content;
							if (typeof delta === 'string' && delta.length > 0) yield delta;
						} catch {
							// malformed chunk — keep already-yielded content, abort
							return;
						}
					}
				}
			}
		} finally {
			try { reader.cancel(); } catch {
				// best effort cleanup
			}
		}
	}

	private async *streamSingle(
		endpoint: string,
		headers: Record<string, string>,
		body: string,
		signal: AbortSignal,
	): AsyncGenerator<string> {
		const res = await fetch(endpoint, { method: 'POST', headers, body, signal });
		this.assertOk(res);
		const json = await res.json();
		const content = json?.choices?.[0]?.message?.content;
		if (typeof content === 'string' && content.length > 0) yield content;
	}

	private assertOk(res: Response): void {
		if (res.ok) return;
		if (res.status === 401 || res.status === 403) {
			throw new Error(`Provider rejected the API key (HTTP ${res.status}).`);
		}
		if (res.status === 429) {
			throw new Error('Rate limited (HTTP 429). Try again shortly.');
		}
		throw new Error(`Couldn't reach AI provider (HTTP ${res.status}).`);
	}
}
