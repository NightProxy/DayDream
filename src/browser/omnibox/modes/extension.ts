// src/browser/omnibox/modes/extension.ts
//
// Omnibox mode triggered when the user types a keyword registered by
// a Helium extension. Fires chrome.omnibox.* events into that
// extension's BG, and renders both:
//   1. The primary "default suggestion" row (from manifest +
//      chrome.omnibox.setDefaultSuggestion).
//   2. Async suggestions emitted by the extension's `suggest()`
//      callback in its `chrome.omnibox.onInputChanged` listener.
//
// Async-suggest plumbing:
//   - BG bootstrap synthesizes the `suggest` callback as a function
//     that channel.sendEvent('chrome.omnibox.suggestions-out', [arr])
//     back to the host. (See installEventRouter at
//     bootstrap/client.ts:936-946.)
//   - ExtensionManager catches that event and calls
//     OmniboxRegistry.applySuggestions(extId, raw). (See
//     extensions.ts ~1860.)
//   - This module reads the latest stored suggestions via
//     `listSuggestions(extId)`. Re-renders are triggered by the
//     omnibox UI itself when the user types again (which re-fires
//     onInputChanged and queues a re-render).

import type { OmniboxRow, OmniboxSection } from '../types';

export interface OmniboxSuggestionDTO {
	content: string;
	description: string;
	deletable?: boolean;
}

export interface ExtensionModeDeps {
	keyword: string;
	rest: string;
	extId: string;
	defaultSuggestionDescription?: string | undefined;
	// Fires the chrome.omnibox event on the owning extension.
	fireEvent: (event: string, args: unknown[]) => void;
	onNavigate: (url: string) => void;
	// Returns the latest async suggestions the extension supplied via
	// its `suggest()` callback. May be empty (most queries return
	// nothing or the extension hasn't called suggest() yet).
	listSuggestions?: (extId: string) => OmniboxSuggestionDTO[];
	// Caller-supplied re-render hook. Used by the host (which has the
	// OmniboxRegistry subscription) to trigger a UI refresh whenever
	// new async suggestions arrive. Unused at sync render time; kept
	// in deps so the caller can hold a stable rerender reference.
	requestRerender?: () => void;
}

export interface ExtensionModeResult {
	primaryRow?: OmniboxRow;
	sections: OmniboxSection[];
}

export function renderExtensionMode(deps: ExtensionModeDeps): ExtensionModeResult {
	const {
		keyword,
		rest,
		extId,
		defaultSuggestionDescription,
		fireEvent,
		onNavigate,
		listSuggestions,
	} = deps;

	// Fire chrome.omnibox.onInputChanged. The BG's `suggest`
	// callback (synthesized by the bootstrap) will eventually post
	// `chrome.omnibox.suggestions-out` back to the host, where
	// ExtensionManager calls OmniboxRegistry.applySuggestions(extId, ...).
	// The caller (omnibox UI) subscribes to OmniboxRegistry.onChange
	// to re-render the moment suggestions arrive.
	fireEvent('chrome.omnibox.onInputChanged', [rest]);

	const label = defaultSuggestionDescription
		? renderSuggestionDescription(defaultSuggestionDescription, rest)
		: `Search ${keyword}: ${rest}`;

	const primaryRow: OmniboxRow = {
		id: `ext-omnibox-${extId}`,
		icon: 'puzzle',
		label,
		sublabel: `Extension keyword: ${keyword}`,
		onSelect: () => {
			fireEvent('chrome.omnibox.onInputEntered', [rest, 'currentTab']);
			// The extension is expected to handle the input. Some
			// extensions don't navigate — they perform other actions.
			// We still bind a navigation handler in case the rest looks
			// like a URL.
			if (/^https?:\/\//i.test(rest)) onNavigate(rest);
		},
	};

	// Build secondary section from stored async suggestions, if any.
	const sections: OmniboxSection[] = [];
	const suggestions = listSuggestions?.(extId) ?? [];
	if (suggestions.length > 0) {
		const rows: OmniboxRow[] = suggestions.map((s, idx) => ({
			id: `ext-suggest-${extId}-${idx}`,
			icon: 'arrow-right',
			label: renderSuggestionDescription(s.description || s.content, rest),
			sublabel: s.content,
			onSelect: () => {
				fireEvent('chrome.omnibox.onInputEntered', [s.content, 'currentTab']);
				if (/^https?:\/\//i.test(s.content)) onNavigate(s.content);
			},
		}));
		sections.push({
			id: `ext-omnibox-suggestions-${extId}`,
			title: `${keyword} suggestions`,
			rows,
		});
	}

	return { primaryRow, sections };
}

// Lightweight render of chrome.omnibox suggestion description XML-like syntax.
// Chrome supports <match>, <dim>, <url>; we strip the tags for display.
function renderSuggestionDescription(desc: string, rest: string): string {
	let out = desc.replace(/<\/?[^>]+>/g, '');
	out = out.replace(/%s/g, rest);
	return out;
}
