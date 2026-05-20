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

import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsAPI } from '@apis/settings';
import { cache } from '@apis/cache';
import { EventSystem } from '@apis/events';
import { ProfilesAPI } from '@apis/profiles';
import { Logger } from '@apis/logging';
import { Proxy } from '@apis/proxy';
import { Windowing } from '@browser/windowing';
import { DDXGlobal } from '@utils/global/index';
import { patchDocument } from './utils/document';
//import { Render } from "@browser/render";
import { Render } from '@components/Render';
import { Items } from '@browser/items';
import { Protocols } from '@browser/protocols';
import { Tabs } from '@browser/tabs';
import { Functions } from '@browser/functions';
import { universalTheme } from '@utils/global/universalTheme';
import { checkNightPlusStatus } from '@apis/nightplus';
import { initClipboardDeobfuscator } from '@utils/clipboardDeobfuscator';
import { basePath, resolvePath } from '@utils/basepath';
//@ts-ignore
import { RefluxAPI } from '@nightnetwork/reflux/api';

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
	const eventsAPI = new EventSystem();
	const refluxAPI = new RefluxAPI();
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

	const proxySetting = ((await settingsAPI.getItem('proxy')) ??
		'sj') as string;
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

		tabs.setupVerticalTabsToggle();

		window.protocols = proto;
		window.windowing = windowing;
		window.items = items;
		window.eventsAPI = eventsAPI;
		window.settings = settingsAPI;
		window.cache = cache;
		window.proxy = proxy;
		//@ts-ignore
		window.reflux = refluxAPI;
		window.logging = loggingAPI;

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
		const transport = await proxy.connection.getTransport();
		if (transport == null) {
			await proxy.setTransports();
		}
		const searchBar = items.addressBar;

		searchBar!.addEventListener('keydown', async e => {
			if (e.key === 'Enter') {
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

		/*if (searchSuggestionsEnabled) {
			const searchbar = new Search(proxy, swConfig, proxySetting, proto);
			if (items.addressBar) {
      await searchbar.init(items.addressBar);
    }
    window.searchbar = searchbar;
  }*/

		window.logging = loggingAPI;
		window.profiles = profilesAPI;
		window.globals = globalFunctions;
		//window.renderer = render;
		//window.functions = functions;
		window.SWconfig = swConfig;
		window.ProxySettings = proxySetting;
	};

	createRoot(shadowRoot.getElementById('root')!).render(
		<StrictMode>
			<Suspense fallback={<div>Loading...</div>}>
				<Render onReady={initializeSystem} />
			</Suspense>
		</StrictMode>
	);
});
