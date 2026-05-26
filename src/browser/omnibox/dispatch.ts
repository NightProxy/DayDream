import type { DispatchResult } from './types';

const URL_PREFIXES = ['http://', 'https://', 'data:', 'javascript:'];

export function dispatch(input: string): DispatchResult {
	if (!input) return { mode: 'closed' };

	// URL-prefix bypass: never enter a mode for URL-shaped input.
	for (const p of URL_PREFIXES) {
		if (input.startsWith(p)) return { mode: 'default', payload: input };
	}

	const trimmed = input.replace(/^\s+/, '');
	if (!trimmed) return { mode: 'closed' };

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
