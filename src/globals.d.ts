import type { ProxyTransport } from '@mercuryworkshop/proxy-transports';
import type * as ScramjetGlobal from '@mercuryworkshop/scramjet';
import type * as ScramjetControllerGlobal from '@mercuryworkshop/scramjet-controller';
import type { SearchEngineRegistry } from '@apis/searchEngines';
import type { CommandRegistry } from '@apis/commands';
import type { Omnibox } from '@browser/omnibox';

declare global {
	const $scramjet: typeof ScramjetGlobal;
	const $scramjetController: typeof ScramjetControllerGlobal;
	interface Window {
		__scramjet$config: SJConfig;
		__scramjet$flags: SJFlags;
		__obscura: {
			ready: boolean;
			encode: (url: string) => string;
			decode: (url: string) => string;
		};
		$scramjet$wrap: Function;
		nightmare: Nightmare;
		settings: SettingsAPI;
		searchEngines: SearchEngineRegistry;
		commands: CommandRegistry;
		omnibox: Omnibox;
		cache: CacheAPI;
		eventsAPI: EventSystem;
		extensions: ExtensionsAPI;
		proxy: Proxy;
		protocols: Protocols;
		logging: Logger;
		profiles: ProfilesAPI;
		globals: DDXGlobal;
		renderer: Render;
		items: Items;
		tabs: Tabs;
		windowing: Windowing;
		functions: Functions;
		keys: Keys;
		SWconfig: any;
		SWSettings: any;
		ProxySettings: string;
		devtools: import('@apis/devtools').DevToolsManager;
		nyxBridge?: import('@apis/nyxBridge').NyxBridge;
		liveInject?: any;
		codeInject?: any;
		d: ShadowRoot;
	}

	interface SWConfig {
		file: string;
		config: any;
		func: Function;
	}

	/*interface SJOptions {
    prefix: string;
    globals?: {
      wrapfn: string;
      wrapthisfn: string;
      trysetfn: string;
      importfn: string;
      rewritefn: string;
      metafn: string;
      setrealmfn: string;
      pushsourcemapfn: string;
    };
    files: {
      wasm: string;
      shared: string;
      worker: string;
      client: string;
      sync: string;
    };
    flags?: {
      serviceworkers?: boolean;
      syncxhr?: boolean;
      naiiveRewriter?: boolean;
      strictRewrites?: boolean;
      rewriterLogs?: boolean;
      captureErrors?: boolean;
      cleanErrors?: boolean;
      scramitize?: boolean;
      sourcemaps?: boolean;
    };
    siteFlags?: {};
    codec?: {
      encode: string;
      decode: string;
    };
  }*/

	interface SJConfig {
		prefix: string;
		injectPath: string;
		scramjetPath: string;
		virtualWasmPath: string;
		wasmPath: string;
		codec: {
			encode: (url: string) => string;
			decode: (url: string) => string;
		};
	}

	interface SJFlags {
		globals: {
			wrapfn: string;
			wrappropertybase: string;
			wrappropertyfn: string;
			cleanrestfn: string;
			importfn: string;
			rewritefn: string;
			metafn: string;
			wrappostmessagefn: string;
			pushsourcemapfn: string;
			trysetfn: string;
			templocid: string;
			tempunusedid: string;
		};
		flags: {
			syncxhr: boolean;
			strictRewrites: boolean;
			rewriterLogs: boolean;
			captureErrors: boolean;
			cleanErrors: boolean;
			scramitize: boolean;
			sourcemaps: boolean;
			destructureRewrites: boolean;
			allowInvalidJs: boolean;
			debugTrampolines: boolean;
			allowFailedIntercepts: boolean;
			encapsulateWorkers: boolean;
			debugSourceURL: boolean;
		};
		siteFlags: Record<string, any>;
		maskedfiles: string[];
	}

	/*declare class ScramjetController {
    constructor(opts: SJOptions);
    init(path?: string): Promise<void>;
    encodeUrl(term: string): string;
  }*/

	interface SJController {
		id: string;
		config: SJConfig;
		scramjetConfig: SJFlags;
		frames: ScramjetControllerGlobal.Frame[];
		serviceWorkerController: ServiceWorker | null;
		rpc: any;
		transport: ProxyTransport | null;
	}
}

export {};
