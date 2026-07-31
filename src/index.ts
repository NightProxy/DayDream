import '@css/vars.scss';
import '@css/imports.scss';
import '@css/tailwind.css';
import '@css/global.scss';
import 'basecoat-css/all';

import { cache } from '@apis/cache';
import { EventSystem } from '@apis/events';
import { Logger } from '@apis/logging';
import { Proxy } from '@apis/proxy';
import { criticalRender } from './boot/criticalRender';
import { universalTheme } from '@utils/global/universalTheme';
import { basePath, resolvePath } from '@utils/basepath';
import { tryRefreshOnBoot } from '@apis/nightplus';
import { Tabs } from '@browser/tabs';
import { Items } from '@browser/items';
import { DDXGlobal } from '@utils/global/index';
import { Windowing } from '@browser/windowing';
import { Protocols } from '@browser/protocols';
import { CachePluginManager } from '@apis/cachePlugins';
import { CommandRegistry } from '@apis/commands';
import { initClipboardDeobfuscator } from '@utils/clipboardDeobfuscator';
import { ExtensionDevToolsManager } from '@apis/devtools/extensionManager';
import { DevToolsManager } from '@apis/devtools';
import { BootReadiness } from './boot/readiness';
import { backgroundInit } from './boot/backgroundInit';
import { featureInit } from './boot/featureInit';
import { defineLazyGlobal } from './boot/lazyGlobals';

const { Controller } = $scramjetController;

document.addEventListener('DOMContentLoaded', async () => {
	const insideTerbium = typeof window !== 'undefined' && !!window.__terbium;
	if (!insideTerbium) {
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
				sessionStorage.setItem('__ddx_sw_cleanup', '1');
				console.log(
					'[Main] Reloading after cleaning up stale SW registrations'
				);
				location.reload();
				return;
			}
			sessionStorage.removeItem('__ddx_sw_cleanup');
		} catch (err) {
			console.warn('[Main] Failed to enumerate SW registrations:', err);
		}
	} else {
		console.log('[Main] Inside Terbium — skipping foreign-SW cleanup');
	}

	const container = document.getElementById('browser-container') as HTMLDivElement | null;
	if (!container) {
		console.error('Browser container not found');
		return;
	}

	criticalRender(container);

	const readiness = new BootReadiness();
	readiness.resolveShell();

	const bgPromise = backgroundInit(readiness);

	setTimeout(() => {
		initClipboardDeobfuscator({ debug: false });
	}, 500);

	const commands = new CommandRegistry();
	window.commands = commands;

	defineLazyGlobal(window, 'devtools', () =>
		new DevToolsManager({
			devtoolsHostUrl: resolvePath('core/i/chii/front_end/ddx_chii_host.html'),
			getTabData: (tabId: string) => window.tabs?.getTabById(tabId),
		})
	);

	defineLazyGlobal(window as unknown as Record<string, unknown>, 'extDevtools', () =>
		new ExtensionDevToolsManager({
			devtoolsHostUrl: resolvePath('core/i/chii/front_end/ddx_chii_host.html'),
			workerAgentUrl: resolvePath('assets/devtools-worker-agent.js'),
		})
	);

	const eventsAPI = new EventSystem();
	const loggingAPI = new Logger();

	const { SW, settingsAPI, profilesAPI, searchEngines } = await bgPromise;
	window.searchEngines = searchEngines;

	window.addEventListener('message', (event) => {
		if (event.data?.type === 'searchEngines-updated') {
			void window.searchEngines.load();
		}
		if (event.data?.type === 'commands-updated') {
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

	try {
		const { getProfileBroadcast } = await import('@apis/data/profileBroadcast');
		const bc = getProfileBroadcast();
		bc.subscribe(async (message) => {
			if (message.type !== 'active-changed') return;
			try {
				const theming = universalTheme.getTheming();
				await theming.applyTheme(theming.currentTheme);
			} catch (error) {
				console.warn('[profiles] theme re-apply failed', error);
			}
			try {
				await (window as any).proxy?.setTransports?.();
			} catch (error) {
				console.warn('[profiles] transport re-register failed', error);
			}
			try {
				const tabs = (window as any).tabs;
				for (const tab of tabs?.tabs ?? []) {
					try { tabs?.reloadTab?.(tab.id); } catch { /* per-tab */ }
				}
			} catch (error) {
				console.warn('[profiles] tab reload failed', error);
			}
		});
	} catch (error) {
		console.warn('[profiles] BroadcastChannel wiring failed', error);
	}

	defineLazyGlobal(window, 'cachePlugins', () => new CachePluginManager());

	const proxy = new Proxy(
		Controller,
		SW,
		window.__scramjet$config,
		window.__scramjet$flags
	);
	window.proxy = proxy;

	const proxySetting = 'sj' as const;
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
	window.profiles = profilesAPI;
	window.globals = globalFunctions;
	window.SWconfig = swConfig;
	window.ProxySettings = proxySetting;

	void tryRefreshOnBoot();

	tabs.createTab('ddx://newtab/');

	window.addEventListener('beforeunload', () => {
		window.tabs.saveSession();
	});

	featureInit(readiness, bgPromise, { tabs, proto, items, proxy, swConfig, proxySetting }).catch(err => {
		console.error('[boot] feature init failed:', err);
	});
});
