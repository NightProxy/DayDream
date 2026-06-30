import type { DispatchResult } from './types';

const URL_PREFIXES = ['http://', 'https://', 'data:', 'javascript:'];

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

	for (const p of URL_PREFIXES) {
		if (input.startsWith(p)) return { mode: 'default', payload: input };
	}

	const trimmed = input.replace(/^\s+/, '');
	if (!trimmed) return { mode: 'closed' };

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
