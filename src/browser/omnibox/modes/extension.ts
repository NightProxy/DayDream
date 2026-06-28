// src/browser/omnibox/modes/extension.ts
//
// Omnibox mode triggered when the user types a keyword registered by
// a Helium extension. Fires chrome.omnibox.* events into that extension
// and renders the default suggestion only.
//
// Async-suggest is best-effort: functions can't be transported across
// the MessagePort that connects host ↔ BG iframe, so we can't pass the
// real `suggest` callback from Chrome's contract. The BG bootstrap
// substitutes a no-op stub (see installEventRouter in
// bootstrap/client.ts) — extensions that call `suggest(...)` won't
// crash, but their suggestion arrays are dropped.

import type { OmniboxRow, OmniboxSection } from '../types';

export interface ExtensionModeDeps {
	keyword: string;
	rest: string;
	extId: string;
	defaultSuggestionDescription?: string | undefined;
	// Fires the chrome.omnibox event on the owning extension.
	fireEvent: (event: string, args: unknown[]) => void;
	onNavigate: (url: string) => void;
}

export interface ExtensionModeResult {
	primaryRow?: OmniboxRow;
	sections: OmniboxSection[];
}

export function renderExtensionMode(deps: ExtensionModeDeps): ExtensionModeResult {
	const { keyword, rest, defaultSuggestionDescription, fireEvent, onNavigate } = deps;

	// Fire chrome.omnibox.onInputChanged each time. Suggestions
	// populated via the extension's `suggest` callback are dropped on
	// the floor (see header comment); only the default suggestion is
	// surfaced as `primaryRow` below.
	fireEvent('chrome.omnibox.onInputChanged', [rest]);

	const label = defaultSuggestionDescription
		? renderSuggestionDescription(defaultSuggestionDescription, rest)
		: `Search ${keyword}: ${rest}`;

	const primaryRow: OmniboxRow = {
		id: `ext-omnibox-${deps.extId}`,
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

	return { primaryRow, sections: [] };
}

// Lightweight render of chrome.omnibox suggestion description XML-like syntax.
// Chrome supports <match>, <dim>, <url>; we strip the tags for display.
function renderSuggestionDescription(desc: string, rest: string): string {
	let out = desc.replace(/<\/?[^>]+>/g, '');
	out = out.replace(/%s/g, rest);
	return out;
}
