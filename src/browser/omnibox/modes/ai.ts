/**
 * `?`-mode for the omnibox. Type `?<query>` → press Enter → navigates the
 * active tab to `ddx://ai` and prefills NyxAI's chat input with the
 * query. NyxAI submits it as a fresh chat with web search forced on.
 *
 * The actual dispatch (queue prefill + navigate) lives in
 * `omnibox/index.ts`. This file owns the dropdown DOM only.
 *
 * Replaced an earlier inline SSE flow that streamed responses from a
 * user-configured OpenAI-compatible endpoint. The settings card and
 * its persisted keys (`aiProviderUrl`, `aiApiKey`, `aiModel`,
 * `aiStreaming`) have been removed.
 */

export function renderAIPromptHint(): string {
	return `<div class="px-3 py-2 text-sm text-[var(--proto)]">Type a question after <code class="bg-[var(--bg-2)] px-1 rounded">?</code> and press Enter to ask Nyx.</div>`;
}

export function renderAskNyxPrimary(prompt: string): string {
	const escPrompt = prompt
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	return `
		<div class="omnibox-row flex items-center gap-3 px-3 py-2 cursor-pointer bg-[var(--white-05)]" data-row-id="ai-ask">
			<i data-lucide="sparkles" class="h-4 w-4 text-[var(--main)] flex-shrink-0"></i>
			<div class="flex-1 min-w-0">
				<div class="text-sm text-[var(--text)] truncate">Ask Nyx: ${escPrompt}</div>
				<div class="text-xs text-[var(--proto)]">Press Enter — opens this tab in Nyx with web search</div>
			</div>
		</div>
	`;
}
