import '@css/vars.scss';
import '@css/imports.scss';
import '@css/tailwind.css';
import '@css/global.scss';
import 'basecoat-css/all';

// Inline CSS for Shadow DOM injection
import varsCSS from '@css/vars.scss?inline';
import importsCSS from '@css/imports.scss?inline';
import tailwindCSS from '@css/tailwind.css?inline';
import globalCSS from '@css/global.scss?inline';

import { SettingsAPI } from '@apis/settings';
import { cache } from '@apis/cache';
import { EventSystem } from '@apis/events';
import { ProfilesAPI } from '@apis/profiles';
import { Logger } from '@apis/logging';
import { Proxy } from '@apis/proxy';
import { SearchEngineRegistry } from '@apis/searchEngines';
import { CommandRegistry } from '@apis/commands';
import { createNyxBridge } from '@apis/nyxBridge';
import { ExtensionManager } from '@apis/extensions';
import { Omnibox } from '@browser/omnibox';
import { Windowing } from '@browser/windowing';
import { DDXGlobal } from '@utils/global/index';
import { patchDocument } from './utils/document';
import { Render } from "@browser/render";
import { Items } from '@browser/items';
import { Protocols } from '@browser/protocols';
import { Tabs } from '@browser/tabs';
import { Functions } from '@browser/functions';
import { universalTheme } from '@utils/global/universalTheme';
import { checkNightPlusStatus, tryRefreshOnBoot } from '@apis/nightplus';
import { initClipboardDeobfuscator } from '@utils/clipboardDeobfuscator';
import { basePath, resolvePath } from '@utils/basepath';
import { DevToolsManager } from '@apis/devtools';
import { ExtensionDevToolsManager } from '@apis/devtools/extensionManager';

const { Controller } = $scramjetController;

/*navigator.serviceWorker?.addEventListener("message", (e) => {
  console.log("[Main] SW message received:", e.data);
  if (e.data?.type === "reload") location.reload();
});
navigator.serviceWorker?.startMessages();*/

document.addEventListener('DOMContentLoaded', async () => {
	try {
		const existing = await navigator.serviceWorker.getRegistrations();
		const desiredScopeUrl = new URL(basePath, location.href).href;
		const stale = existing.filter(reg => reg.scope !== desiredScopeUrl);
		if (stale.length > 0 && !sessionStorage.getItem('__ddx_sw_cleanup')) {
			for (const reg of stale) {
				console.log(
					'[Main] Unregistering stale SW with scope:',
					reg.scope
				);
				try {
					await reg.unregister();
				} catch (err) {
					console.warn('[Main] Failed to unregister stale SW:', err);
				}
			}
			// Mark cleanup done so we don't loop, then reload to drop any
			// active controller bindings to the unregistered SWs.
			sessionStorage.setItem('__ddx_sw_cleanup', '1');
			console.log(
				'[Main] Reloading after cleaning up stale SW registrations'
			);
			location.reload();
			return;
		}
		// Clear the cleanup flag once we've successfully loaded without stale SWs
		sessionStorage.removeItem('__ddx_sw_cleanup');
	} catch (err) {
		console.warn('[Main] Failed to enumerate SW registrations:', err);
	}

	const SW = await navigator.serviceWorker.register(resolvePath('sw.js'), {
		scope: basePath
	});
	await navigator.serviceWorker.ready;
	let systemInitialized = false;

	await universalTheme.init();

	setTimeout(() => {
		initClipboardDeobfuscator({ debug: false });
	}, 500);

	const settingsAPI = new SettingsAPI();
	const searchEngines = new SearchEngineRegistry(settingsAPI);
	await searchEngines.load();
	window.searchEngines = searchEngines;

	const commands = new CommandRegistry();
	window.commands = commands;

	const devtools = new DevToolsManager({
		devtoolsHostUrl: resolvePath('core/i/chii/front_end/ddx_chii_host.html'),
		getTabData: (tabId: string) => window.tabs?.getTabById(tabId),
	});
	window.devtools = devtools;

	const extDevtools = new ExtensionDevToolsManager({
		devtoolsHostUrl: resolvePath('core/i/chii/front_end/ddx_chii_host.html'),
		workerAgentUrl: resolvePath('assets/devtools-worker-agent.js'),
	});
	(window as { extDevtools?: ExtensionDevToolsManager }).extDevtools = extDevtools;

	window.addEventListener('message', (event) => {
		if (event.data?.type === 'searchEngines-updated') {
			void window.searchEngines.load();
		}
		if (event.data?.type === 'commands-updated') {
			// Reserved for future custom-commands feature; v1 has no behavior here.
		}
		if (event.data?.type === 'keybinds-updated') {
			const reseed = async () => {
				const { KeybindManager } = await import('@browser/functions/keybinds');
				const km = new KeybindManager(settingsAPI);
				await km.loadKeybinds();
				window.commands.clearBySource('keybind');
				window.commands.seedFromKeybinds({
					keybinds: km.getAllKeybinds(),
					formatKeybind: (kb) => km.formatKeybind(kb),
					tabs: window.tabs,
					protocols: window.protocols,
				});
			};
			void reseed();
		}
	});

	const eventsAPI = new EventSystem();
	//await cache.init();

	const profilesAPI = new ProfilesAPI(checkNightPlusStatus, 3);
	await profilesAPI.initPromise;

	const loggingAPI = new Logger();

	const proxy = new Proxy(
		Controller,
		SW,
		window.__scramjet$config,
		window.__scramjet$flags
	);
	window.proxy = proxy;

	// Backend swap removed in round-2 settings redesign — Scramjet ('sj') is the only
	// supported backend. The old `proxy` SettingsAPI key (auto/sj/uv) is no longer read.
	// Legacy settings page still writes it harmlessly.
	const proxySetting = 'sj' as const;
	let swConfigSettings: Record<string, any> = {};
	var swConfig = {
		sj: {
			file: resolvePath('sw.js'),
			config: window.__scramjet$config,
			func: async () => {
				await proxy.setTransports();
				console.log('Scramjet Service Worker registered.');
			}
		},
		// 'auto' was the "no service worker" mode; unreachable since round-2 backend swap removal.
		auto: {
			file: null,
			config: null,
			func: null
		}
	};

	const container: HTMLDivElement | null = document.getElementById(
		'browser-container'
	) as HTMLDivElement;

	let shadowRoot: ShadowRoot;
	if (container) {
		shadowRoot = container.attachShadow({ mode: 'open' });
	} else {
		console.error('Browser container not found');
		return;
	}

	shadowRoot.append(
		Object.assign(document.createElement('style'), {
			textContent: varsCSS + importsCSS + tailwindCSS + globalCSS
		}),
		Object.assign(document.createElement('div'), {
			id: 'root',
			style: 'width: 100%; height: 100%; position: fixed; inset: 0;'
		})
	);

	const shadowDocument = document.implementation.createHTMLDocument('');

	patchDocument(shadowRoot, shadowDocument);

	window.d = shadowRoot; //DONT FUCKING CHNAGE THIS TO "doc" OR ANYTHING ELSE, IT'S USED IN THE DOCUMENT PATCHING AND IF YOU CHANGE IT, THE PATCHING WILL BREAK AND THE WHOLE BROWSER WILL BREAK

	const initializeSystem = async () => {
		console.log(swConfig[proxySetting as keyof typeof swConfig]);
		if (systemInitialized) {
			return;
		}

		systemInitialized = true;

		setTimeout(() => {
			const theming = universalTheme.getTheming();
			theming.applyTheme(theming.currentTheme);
		}, 100);

		const proto = new Protocols(swConfig, proxySetting, proxy);
		const windowing = new Windowing();
		const globalFunctions = new DDXGlobal();
		const items = new Items();
		const tabs = new Tabs(proto, swConfig, proxySetting, items, proxy);

		window.tabs = tabs;
		(window as any).toggleVerticalTabsLayout = () =>
			window.tabs.toggleVerticalTabsLayout();
		(window as any).toggleVerticalTabsCollapsed = () =>
			window.tabs.toggleVerticalTabsCollapsed();

		tabs.initSplitLayout();
		tabs.setupVerticalTabsToggle();
		// Wire host-shell context menus (tab strip background, back/forward/
		// reload buttons). Must run after items are ready and tabs are wired.
		tabs.auxiliaryMenus.installHostShellMenus();

		window.protocols = proto;
		window.windowing = windowing;
		window.items = items;
		window.eventsAPI = eventsAPI;
		window.settings = settingsAPI;
		window.cache = cache;
		window.proxy = proxy;
		//@ts-ignore
		window.logging = loggingAPI;

		// Proactively refresh the Night+ access token on boot so any
		// embedded app that reads through nyxBridge (NyxAI's
		// auth.getPlusToken) gets a fresh token rather than a stale one
		// from last session. Fire-and-forget — the refresh path swallows
		// its own errors and reactive 401-retry remains as the safety
		// net. We don't await before nyxBridge.init() because the bridge
		// only needs to be wired before NyxAI's iframe loads, and
		// refresh is just a network round-trip that can complete in the
		// background.
		void tryRefreshOnBoot();

		// NyxAI bridge — host-side coordinator that gives ddx://ai (NyxAI)
		// typed control over DDX tabs. Stub for now; subsequent tasks wire
		// handshake, channel, and per-frame agent.
		const nyxBridge = createNyxBridge({
			tabs: window.tabs,
			proxy: window.proxy,
			settings: window.settings,
		});
		await nyxBridge.init();
		window.nyxBridge = nyxBridge;

		// Helium extension manager. Hydrates from /extensions/_index.json
		// (in TFS), spawns each enabled extension's hidden iframe,
		// registers per-extension RPC handlers for chrome.* methods.
		// Reuses NyxBridge's HandlerContext for browser-control
		// delegation (tabs, future cookies/bookmarks/etc.).
		const extensionManager = new ExtensionManager(
			window.proxy,
			nyxBridge.getHandlerContext(),
		);

		// `chrome_url_overrides` coordinator. Wired BEFORE
		// extensionManager.init() so any auto-spawn-time install hooks
		// (currently none — hooks only fire on user-initiated install,
		// but defensive) see the coordinator. After init(), we replay
		// any persisted active overrides into the Protocols layer so
		// the user's previously-confirmed newtab/bookmarks/history
		// overrides survive restarts.
		const { ExtensionUrlOverrides } = await import('@apis/extensions/urlOverrides');
		const urlOverrides = new ExtensionUrlOverrides(proto);
		extensionManager.setUrlOverrides(urlOverrides);

		await extensionManager.init();
		(window as any).extensions = extensionManager;
		(window as any).extensionUrlOverrides = urlOverrides;

		// Replay persisted active overrides now that extensions are
		// spawned (so `getManifest(extId)` can resolve).
		await urlOverrides.applyAll((extId) => extensionManager.getManifest(extId));

		// Mount per-extension toolbar buttons (browser-action + page-action)
		// inside the urlbar-ring. Render is already in the shadow DOM at
		// this point. Toolbar self-subscribes to lifecycle events
		// (tabSelected, install/uninstall, action-state mutations) for
		// auto-refresh.
		try {
			const { ExtensionToolbarButtons } = await import('@browser/extensions/toolbarButtons');
			const toolbar = new ExtensionToolbarButtons();
			const tryMount = (): void => {
				if (!toolbar.install()) {
					// urlbar-ring not in DOM yet — retry next frame.
					requestAnimationFrame(tryMount);
				}
			};
			tryMount();
			(window as any).extensionToolbar = toolbar;
		} catch (err) {
			console.warn('[index] extension toolbar mount failed:', err);
		}

		// Mount the download shelf. Slot is in render.ts (hidden by
		// default). Shelf subscribes to DownloadsManager events and
		// auto-shows when the first download arrives.
		try {
			const { DownloadShelf } = await import('@browser/downloads/shelf');
			const shelf = new DownloadShelf();
			const tryMount = (): void => {
				if (!shelf.install()) requestAnimationFrame(tryMount);
			};
			tryMount();
			window.downloadShelf = shelf;
		} catch (err) {
			console.warn('[index] download shelf mount failed:', err);
		}

		// Mount the lock-icon dropdown. Wires the `[data-component=
		// "site-info"]` button to a floating panel showing the
		// current site's permissions + cookie count + "Clear site
		// data" button.
		try {
			const { LockDropdown } = await import('@browser/sitePermissions/lockDropdown');
			const lock = new LockDropdown();
			const tryMount = (): void => {
				if (!lock.install()) requestAnimationFrame(tryMount);
			};
			tryMount();
			window.lockDropdown = lock;
		} catch (err) {
			console.warn('[index] lock dropdown mount failed:', err);
		}

		const startupBehavior =
			(await settingsAPI.getItem('startupBehavior')) || 'newtab';
		const startupCustomUrl =
			(await settingsAPI.getItem('startupCustomUrl')) || '';

		/*if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.ready;
  }*/

		let restored = false;
		if (startupBehavior === 'restore') {
			restored = await window.tabs.restoreSession();
		}

		if (!restored) {
			if (startupBehavior === 'custom' && startupCustomUrl) {
				window.tabs.createTab(startupCustomUrl);
			} else {
				window.tabs.createTab('ddx://newtab/');
			}
		}

		window.addEventListener('beforeunload', () => {
			window.tabs.saveSession();
		});

		const functions = new Functions(tabs, proto);
		await functions.initPromise;
		await functions.init();

		if (
			proxySetting === 'sj' &&
			swConfig[proxySetting as keyof typeof swConfig] &&
			typeof swConfig[proxySetting as keyof typeof swConfig].func ===
				'function'
		) {
			await (
				swConfig[proxySetting as keyof typeof swConfig].func as Function
			)();
		}

		await proxy.registerSW(swConfig[proxySetting as keyof typeof swConfig]);
		await proxy.setTransports();
		const transport = await proxy.getTransports().then(transports => transports.active);
		if (transport == null) {
			await proxy.setTransports();
		}
		const searchBar = items.addressBar;

		searchBar!.addEventListener('keydown', async e => {
			if (e.key === 'Enter') {
				if ((e as any).__omniboxConsumed) return;
				e.preventDefault();

				const searchValue = searchBar!.value.trim();

				if (proto.isRegisteredProtocol(searchValue)) {
					const url =
						(await proto.processUrl(searchValue)) ||
						resolvePath('internal/error/');
					const iframe = items.frameContainer!.querySelector(
						'iframe.active'
					) as HTMLIFrameElement | null;

					if (iframe) {
						iframe.setAttribute('src', url);
					} else {
						console.warn('No active iframe found for navigation');
					}
				} else {
					swConfigSettings =
						swConfig[proxySetting as keyof typeof swConfig];
					window.SWSettings = swConfigSettings;

					if (!swConfigSettings || !swConfigSettings.config) {
						console.warn(
							'[urlbar] No swConfig for proxySetting',
							proxySetting
						);
						return;
					}

					const activeIframe = document.querySelector(
						'iframe.active'
					) as HTMLIFrameElement | null;

					if (activeIframe) {
						await proxy.redirect(
							swConfig,
							proxySetting,
							searchValue,
							activeIframe
						);
					} else {
						// No tab open yet — open a new one with the encoded URL
						await proxy.registerSW(swConfigSettings);
						await proxy.setTransports();
						const prefix =
							swConfigSettings.config?.prefix ?? '/~/sj/';
						const encodedUrl =
							prefix +
							proxy.encodeUrl(proxy.search(searchValue));
						tabs.createTab(location.origin + encodedUrl);
					}
				}
			}
		});

		// Seed the command registry now that tabs/proto are fully ready.
		// Uses a local KeybindManager to read the user's current keybinds —
		// the registry stores closures that don't depend on this instance's
		// lifetime.
		{
			const { KeybindManager } = await import('@browser/functions/keybinds');
			const km = new KeybindManager(settingsAPI);
			await km.loadKeybinds();
			commands.seedFromKeybinds({
				keybinds: km.getAllKeybinds(),
				formatKeybind: (kb) => km.formatKeybind(kb),
				tabs,
				protocols: proto,
			});
			commands.seedFromProtocols(proto.listRoutes(), (url) => proto.navigate(url));
			commands.seedBuiltins({ tabs, protocols: proto });
		}

		if (items.addressBar) {
			const omnibox = new Omnibox({
				input: items.addressBar,
				proxy,
				protocols: proto,
				tabs,
				searchEngines,
				commands,
				swConfig,
				proxySetting,
			});
			omnibox.attach();
			window.omnibox = omnibox;
		}

		window.logging = loggingAPI;
		window.profiles = profilesAPI;
		window.globals = globalFunctions;
		//window.renderer = render;
		window.functions = functions;
		window.SWconfig = swConfig;
		window.ProxySettings = proxySetting;
	};

	const root = shadowRoot.getElementById('root') as HTMLDivElement;
	new Render(root);
	initializeSystem();
});
