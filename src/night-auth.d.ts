// Ambient module declaration for @nightnetwork/night-auth (1.2.x).
//
// The published package ships only UMD/CDN bundles and has no shipped
// .d.ts. Daylight authored these by reading the bundle; we vendor a copy
// here so DDX can `import NightLogin from "@nightnetwork/night-auth"`
// instead of polling for window.NightLogin from a copied UMD asset.
//
// Keep in sync with Daylight/src/night-auth.d.ts.
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
