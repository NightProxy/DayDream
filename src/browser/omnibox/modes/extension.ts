
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
	fireEvent: (event: string, args: unknown[]) => void;
	onNavigate: (url: string) => void;
	listSuggestions?: (extId: string) => OmniboxSuggestionDTO[];
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
			if (/^https?:\/\//i.test(rest)) onNavigate(rest);
		},
	};

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

function renderSuggestionDescription(desc: string, rest: string): string {
	let out = desc.replace(/<\/?[^>]+>/g, '');
	out = out.replace(/%s/g, rest);
	return out;
}
