// src/core/helium/host/devtools/page.ts
//
// Devtools-page iframe spawner.
//
// Per spec §24.1: when an extension declares `devtools_page:
// 'devtools.html'` AND devtools opens for some tab, we spawn a
// hidden iframe at https://<extId>.ddx/devtools.html that runs in
// the extension's origin with the HeliumExtensionPlugin attached.
//
// This module owns:
//   - the per-(extId, tabId) hidden iframe registry,
//   - lifecycle hooks (spawn / despawn / despawnAllForExt / despawnAllForTab),
//   - exposing the active inspected tabId for inspectedWindow.tabId
//     resolution.
//
// devtools_page iframes are constructed with `ctxOverrides: { inDevtools: true }`
// so the bootstrap client surfaces `chrome.devtools.*` (panels,
// inspectedWindow, network) on the chrome global. Regular BG iframes
// don't carry the flag and so don't expose those namespaces.

import type { Proxy } from '@apis/proxy';
import { HeliumExtensionPlugin } from '../../extfs/plugin';
import type { ExtensionContext } from '../../extfs/types';

const CONTAINER_ID = '__helium_devtools_pages__';

interface DevtoolsPageEntry {
	extId: string;
	tabId: string; // DDX tabId
	tabIdNum: number; // numeric tabId for chrome.devtools.inspectedWindow.tabId
	iframe: HTMLIFrameElement;
}

export interface DevtoolsPageHostDeps {
	proxy: Proxy;
	/** Maps DDX tabId → numeric tabId (assigned by TabResolver). */
	tabIdToNum: (ddxId: string) => number;
}

export class DevtoolsPageHost {
	private readonly pages = new Map<string, DevtoolsPageEntry>(); // key = `${extId}::${tabId}`
	private container: HTMLDivElement | null = null;

	constructor(private readonly deps: DevtoolsPageHostDeps) {}

	/**
	 * Spawn a devtools_page iframe for (extId, tabId). No-op if the
	 * extension declares no devtools_page or the iframe is already
	 * spawned for this pair.
	 */
	async spawn(
		ctx: ExtensionContext,
		ddxTabId: string,
	): Promise<DevtoolsPageEntry | null> {
		const m = ctx.manifest as { devtools_page?: string };
		const devtoolsPage = m.devtools_page;
		if (!devtoolsPage) return null;
		const key = `${ctx.id}::${ddxTabId}`;
		const existing = this.pages.get(key);
		if (existing) return existing;

		const container = this.ensureContainer();
		const iframe = document.createElement('iframe');
		iframe.dataset.heliumDevtoolsPage = ctx.id;
		iframe.dataset.heliumDevtoolsTab = ddxTabId;
		iframe.style.display = 'none';

		// Compute the numeric tabId now and bake it into ctx. This
		// makes `chrome.devtools.inspectedWindow.tabId` a synchronous
		// read inside the devtools_page realm, matching Chrome's
		// contract (extensions read it inline and pass it into
		// `chrome.tabs.sendMessage` etc.).
		const tabIdNum = this.deps.tabIdToNum(ddxTabId);
		const plugin = new HeliumExtensionPlugin(ctx, {
			ctxOverrides: { inDevtools: true, inspectedTabId: tabIdNum },
		});
		let frame: { go?: (url: string) => void } | null = null;
		try {
			frame = (await this.deps.proxy.createFrame(iframe, {
				plugins: [plugin],
			})) as { go?: (url: string) => void };
		} catch (err) {
			console.warn(
				'[helium/devtools] devtools_page: proxy.createFrame failed',
				err,
			);
			return null;
		}

		container.appendChild(iframe);

		const url = `https://${ctx.origin}/${devtoolsPage.replace(/^\/+/, '')}`;
		try {
			if (typeof frame?.go === 'function') {
				frame.go(url);
			} else {
				iframe.src = url;
			}
		} catch (err) {
			console.warn('[helium/devtools] devtools_page: frame.go failed', err);
		}

		const entry: DevtoolsPageEntry = {
			extId: ctx.id,
			tabId: ddxTabId,
			tabIdNum,
			iframe,
		};
		this.pages.set(key, entry);

		// Register as inspectable target so it shows up on the
		// ddx://extensions "Inspect views" list. Best-effort — the
		// manager may not exist yet during early init.
		try {
			const w = window as {
				extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
			};
			w.extDevtools?.targetRegistry.register({
				extId: ctx.id,
				targetId: `devtools-page::${ddxTabId}`,
				kind: 'devtools-page',
				iframe,
				label: `DevTools page (tab ${ddxTabId})`,
				tabId: ddxTabId,
			});
		} catch (err) {
			console.warn('[helium/devtools] register devtools_page target threw:', err);
		}
		return entry;
	}

	despawn(extId: string, ddxTabId: string): void {
		const key = `${extId}::${ddxTabId}`;
		const e = this.pages.get(key);
		if (!e) return;
		try { e.iframe.remove(); } catch { /* ignore */ }
		this.pages.delete(key);
		try {
			const w = window as {
				extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
			};
			w.extDevtools?.targetRegistry.unregister(extId, `devtools-page::${ddxTabId}`);
		} catch (err) {
			console.warn('[helium/devtools] unregister devtools_page target threw:', err);
		}
	}

	despawnAllForExt(extId: string): void {
		for (const [k, e] of this.pages) {
			if (e.extId === extId) {
				try { e.iframe.remove(); } catch { /* ignore */ }
				this.pages.delete(k);
				this.unregisterTarget(e.extId, e.tabId);
			}
		}
	}

	despawnAllForTab(ddxTabId: string): void {
		for (const [k, e] of this.pages) {
			if (e.tabId === ddxTabId) {
				try { e.iframe.remove(); } catch { /* ignore */ }
				this.pages.delete(k);
				this.unregisterTarget(e.extId, e.tabId);
			}
		}
	}

	private unregisterTarget(extId: string, ddxTabId: string): void {
		try {
			const w = window as {
				extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
			};
			w.extDevtools?.targetRegistry.unregister(extId, `devtools-page::${ddxTabId}`);
		} catch (err) {
			console.warn('[helium/devtools] unregister devtools_page target (bulk) threw:', err);
		}
	}

	/**
	 * Look up the active inspected-tab number for an extension. If the
	 * extension has multiple open devtools_page iframes (one per tab),
	 * v1 returns the first one — Chrome's chrome.devtools.inspectedWindow.tabId
	 * is per-devtools-page-instance, which on Chrome maps 1:1 to the
	 * window the page is hosted in. We don't have multiple windows in
	 * Helium yet, so first-match is correct.
	 */
	getInspectedTabId(extId: string): number | null {
		for (const e of this.pages.values()) {
			if (e.extId === extId) return e.tabIdNum;
		}
		return null;
	}

	/** Returns the set of extIds with at least one open devtools_page. */
	getActiveExtIds(): string[] {
		const out = new Set<string>();
		for (const e of this.pages.values()) out.add(e.extId);
		return [...out];
	}

	/**
	 * Return the live contentWindow of every devtools_page iframe
	 * currently spawned for the supplied extension. Used by
	 * chrome.extension.getViews({ type: 'devtools' }).
	 */
	getActiveWindowsForExt(extId: string): Window[] {
		const out: Window[] = [];
		for (const e of this.pages.values()) {
			if (e.extId !== extId) continue;
			const w = e.iframe.contentWindow;
			if (w) out.push(w);
		}
		return out;
	}

	private ensureContainer(): HTMLDivElement {
		if (this.container) return this.container;
		let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
		if (!el) {
			el = document.createElement('div');
			el.id = CONTAINER_ID;
			el.style.display = 'none';
			el.setAttribute('aria-hidden', 'true');
			document.body.appendChild(el);
		}
		this.container = el;
		return el;
	}
}
