export type OmniboxMode = 'closed' | 'default' | 'command' | 'engine' | 'bang' | 'ai' | 'extension';

export interface DispatchResult {
	mode: OmniboxMode;
	payload?: string;
	extension?: {
		extId: string;
		keyword: string;
		rest: string;
		defaultSuggestionDescription?: string;
	};
}

export interface OmniboxRow {
	id: string;
	icon?: string;
	label: string;
	sublabel?: string;
	rightHint?: string;
	onSelect: () => void | Promise<void>;
}

export interface OmniboxSection {
	id: string;
	title: string;
	icon?: string;
	rows: OmniboxRow[];
	hasMore?: boolean;
}
