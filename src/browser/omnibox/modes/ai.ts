import type { AIClient } from '@apis/ai';
import type { Protocols } from '@browser/protocols';

export interface AIModeDeps {
	prompt: string;
	aiClient: AIClient;
	protocols: Pick<Protocols, 'navigate'>;
	dropdown: HTMLDivElement;
	onClose: () => void;
}

export function renderAIPromptHint(): string {
	return `<div class="px-3 py-2 text-sm text-[var(--proto)]">Type your question after <code class="bg-[var(--bg-2)] px-1 rounded">?</code> and press Enter to ask the AI.</div>`;
}

export function renderAIPromptPrimary(deps: AIModeDeps): string {
	const provider = deps.aiClient.getConfig().url || '(none)';
	const providerHost = (() => {
		try { return new URL(provider).hostname; } catch { return provider; }
	})();
	const escPrompt = deps.prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const escHost = providerHost.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `
		<div class="omnibox-row flex items-center gap-3 px-3 py-2 cursor-pointer bg-[var(--white-05)]" data-row-id="ai-ask">
			<i data-lucide="sparkles" class="h-4 w-4 text-[var(--main)] flex-shrink-0"></i>
			<div class="flex-1 min-w-0">
				<div class="text-sm text-[var(--text)] truncate">Ask AI: ${escPrompt}</div>
				<div class="text-xs text-[var(--proto)]">Press Enter to ask · ${escHost}</div>
			</div>
		</div>
	`;
}

export function renderAINotConfigured(): string {
	return `
		<div class="px-3 py-3">
			<div class="text-sm text-[var(--text)] mb-2">AI provider not configured.</div>
			<div class="text-xs text-[var(--proto)] mb-3">Open Settings to add an OpenAI-compatible endpoint.</div>
			<button class="omnibox-ai-open-settings px-3 py-1 text-xs rounded bg-[var(--main)] text-white">Open Settings</button>
		</div>
	`;
}

export async function startAIStream(
	deps: AIModeDeps,
	abort: AbortController,
): Promise<void> {
	const { dropdown, prompt, aiClient } = deps;
	const escPrompt = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	dropdown.innerHTML = `
		<div class="omnibox-ai-panel p-3 space-y-3">
			<div class="omnibox-ai-prompt rounded bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--proto)]">${escPrompt}</div>
			<div class="omnibox-ai-response rounded bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)] whitespace-pre-wrap"></div>
			<div class="omnibox-ai-status flex justify-end gap-2 text-xs text-[var(--proto)]">
				<button class="omnibox-ai-stop px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Stop</button>
			</div>
		</div>
	`;
	const responseEl = dropdown.querySelector('.omnibox-ai-response') as HTMLDivElement;
	const statusEl = dropdown.querySelector('.omnibox-ai-status') as HTMLDivElement;
	const stopBtn = dropdown.querySelector('.omnibox-ai-stop') as HTMLButtonElement;
	stopBtn?.addEventListener('mousedown', (ev) => {
		ev.preventDefault();
		abort.abort();
	});

	let accumulated = '';
	try {
		for await (const delta of aiClient.stream(prompt, abort.signal)) {
			if (abort.signal.aborted) break;
			accumulated += delta;
			responseEl.textContent = accumulated;
		}
		statusEl.innerHTML = `
			<button class="omnibox-ai-copy px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Copy</button>
			<button class="omnibox-ai-new px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">New question</button>
		`;
		const copyBtn = statusEl.querySelector('.omnibox-ai-copy') as HTMLButtonElement;
		const newBtn = statusEl.querySelector('.omnibox-ai-new') as HTMLButtonElement;
		copyBtn?.addEventListener('mousedown', (ev) => {
			ev.preventDefault();
			void navigator.clipboard.writeText(accumulated).catch(() => {});
		});
		newBtn?.addEventListener('mousedown', (ev) => {
			ev.preventDefault();
			deps.onClose();
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const escMsg = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		statusEl.innerHTML = `
			<div class="text-red-400">${escMsg}</div>
			<button class="omnibox-ai-retry px-2 py-1 rounded bg-[var(--bg-1)] border border-[var(--white-10)]">Retry</button>
		`;
	}
}
