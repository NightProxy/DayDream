import type { DispatchResult } from './types';

const URL_PREFIXES = ['http://', 'https://', 'data:', 'javascript:'];

// Subset of the OmniboxRegistry API we consult for keyword detection.
// Resolved lazily from `window.extensions?.omniboxRegistry` to avoid
// pulling Helium into the dispatch unit's import graph.
interface OmniboxRegistryLike {
	matchPrefix(input: string): {
		extId: string;
		keyword: string;
		rest: string;
		defaultSuggestion?: { description: string };
	} | null;
}

function getExtensionOmniboxRegistry(): OmniboxRegistryLike | null {
	if (typeof window === 'undefined') return null;
	const w = window as { extensions?: { omniboxRegistry?: OmniboxRegistryLike } };
	return w.extensions?.omniboxRegistry ?? null;
}

export function dispatch(input: string): DispatchResult {
	if (!input) return { mode: 'closed' };

	// URL-prefix bypass: never enter a mode for URL-shaped input.
	for (const p of URL_PREFIXES) {
		if (input.startsWith(p)) return { mode: 'default', payload: input };
	}

	const trimmed = input.replace(/^\s+/, '');
	if (!trimmed) return { mode: 'closed' };

	// Extension-keyword detection comes BEFORE sigil checks. An extension
	// declared keyword "tk " would still allow ">tk" to be a command-palette
	// query because the registry only matches `<keyword>` or `<keyword> `.
	const reg = getExtensionOmniboxRegistry();
	if (reg) {
		const match = reg.matchPrefix(trimmed);
		if (match) {
			const ext: NonNullable<DispatchResult['extension']> = {
				extId: match.extId,
				keyword: match.keyword,
				rest: match.rest,
			};
			if (match.defaultSuggestion?.description) {
				ext.defaultSuggestionDescription = match.defaultSuggestion.description;
			}
			return {
				mode: 'extension',
				payload: match.rest,
				extension: ext,
			};
		}
	}

	const first = trimmed[0];
	switch (first) {
		case '>':
			return { mode: 'command', payload: trimmed.slice(1) };
		case '@':
			return { mode: 'engine', payload: trimmed.slice(1) };
		case '!':
			return { mode: 'bang', payload: trimmed.slice(1) };
		case '?':
			return { mode: 'ai', payload: trimmed.slice(1) };
		default:
			return { mode: 'default', payload: trimmed };
	}
}
