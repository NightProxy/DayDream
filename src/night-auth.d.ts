declare module '@nightnetwork/night-auth' {
	type Theme = 'system' | 'light' | 'dark';
	interface NightLoginOptions {
		service: string;
		theme?: Theme;
		backdropBlur?: string;
		zIndex?: number;
		onSuccess?: (token: unknown) => void;
		onCancel?: () => void;
		API_URL?: string;
		assetUrl?: string;
		disableFontInjection?: boolean;
		fetchOverride?: (url: string, init?: RequestInit) => Promise<Response>;
	}
	export default class NightLogin {
		modalVisible: boolean;
		constructor(options: NightLoginOptions);
		show(container?: string | HTMLElement): void;
		hide(): void;
		close(): void;
		oauth(): void;
		renderTrigger(parent: string | HTMLElement): void;
	}
}
