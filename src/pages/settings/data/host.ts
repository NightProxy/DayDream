// Host-API accessor helpers for the settings iframe.
//
// The settings page is loaded inside an <iframe> (auto-routed by
// srv/vite/routes.ts → /internal/settings/). The host browser at
// src/index.ts attaches APIs like window.profiles, window.proxy,
// window.eventsAPI, window.settings, etc. From inside the iframe these
// live on window.parent — and they may not be attached yet when the
// iframe first boots.
//
// This module centralizes access by polling window.parent for each API
// (with a 3 s timeout) so callers don't have to repeat the boilerplate
// or accidentally read from their own iframe's window (where nothing
// was ever attached).
//
// Naming note: the host attaches the SettingsAPI instance as
// `window.settings` (see src/index.ts:233), not `window.settingsAPI`.
// `getSettingsAPI()` reads from `host.settings` to match runtime.
// Similarly `globalTheming` is attached via `(window as any).globalTheming`
// in src/utils/global/theming.ts:807 and is not declared on the Window
// interface, so we widen the type below with HostWindow.

import type { ProfilesAPI } from "@apis/profiles/ProfilesAPI";
import type { Proxy } from "@apis/proxy";
import type { SitePermissionsStore } from "@apis/sitePermissions";
import type { Themeing } from "@utils/global/theming";
import type { DownloadShelf } from "@browser/downloads/shelf";
import type { EventSystem } from "@apis/events";
import type { SettingsAPI } from "@apis/settings";

const HOST_TIMEOUT_MS = 3000;
// 25ms ≈ 1.5 frames @ 60Hz; up to ~120 polls within the 3s budget
const POLL_INTERVAL_MS = 25;

type HostWindow = Window & {
	profiles?: ProfilesAPI;
	proxy?: Proxy;
	sitePermissionsStore?: SitePermissionsStore;
	globalTheming?: Themeing;
	downloadShelf?: DownloadShelf;
	eventsAPI?: EventSystem;
	settings?: SettingsAPI;
	tabs?: { createTab: (url: string) => Promise<unknown> };
};

const host = window.parent as HostWindow;

async function waitFor<T>(
	getter: () => T | undefined,
	name: string,
): Promise<T> {
	const start = performance.now();
	while (performance.now() - start < HOST_TIMEOUT_MS) {
		const value = getter();
		if (value !== undefined) return value;
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error(`[host] timed out waiting for window.parent.${name}`);
}

export async function getProfiles(): Promise<ProfilesAPI> {
	const api = await waitFor(() => host.profiles, "profiles");
	await api.initPromise;
	return api;
}

export async function getProxy(): Promise<Proxy> {
	return waitFor(() => host.proxy, "proxy");
}

export async function getSitePermissions(): Promise<SitePermissionsStore> {
	return waitFor(() => host.sitePermissionsStore, "sitePermissionsStore");
}

export async function getTheming(): Promise<Themeing> {
	return waitFor(() => host.globalTheming, "globalTheming");
}

export async function getDownloadShelf(): Promise<DownloadShelf | null> {
	try {
		return await waitFor(() => host.downloadShelf, "downloadShelf");
	} catch {
		return null;
	}
}

/** Direct sync getter — eventsAPI is always present once the host has booted. */
export function getEventsAPI(): EventSystem {
	if (!host.eventsAPI) throw new Error("[host] eventsAPI not initialized");
	return host.eventsAPI;
}

/** Direct sync getter — settingsAPI is always present once the host has booted. */
export function getSettingsAPI(): SettingsAPI {
	// Host attaches as `window.settings` (src/index.ts:233), not
	// `window.settingsAPI`. Read from the actual runtime location.
	if (!host.settings) throw new Error("[host] settings not initialized");
	return host.settings;
}

/**
 * Escape hatch for ad-hoc host reads. Prefer the typed getters above —
 * they handle the boot-race. Direct host-object access bypasses polling
 * and may see undefined fields if called before the host finishes booting.
 */
export function getHost(): HostWindow {
	return host;
}

/**
 * Open a URL in a new browser tab via the host's `Tabs` API.
 *
 * Why this helper exists:
 * The settings page lives in an iframe. Setting `location.href = "ddx://X/"`
 * inside the iframe only navigates the iframe itself — it doesn't open a
 * new tab and the URL scheme isn't even resolvable inside the iframe's
 * routing. The canonical way is `window.parent.tabs.createTab(url)` which
 * tells the host browser to create a new tab pointing at the URL.
 *
 * Accepts both `ddx://` internal-page URLs and regular https URLs. The
 * host's `Tabs.createTab()` handles routing in either case.
 *
 * Returns a promise that resolves when the tab is created. Failures are
 * swallowed and logged — link click handlers should not throw on the user.
 */
export async function openInNewTab(url: string): Promise<void> {
	try {
		if (host.tabs?.createTab) {
			await host.tabs.createTab(url);
			return;
		}
		// Fallback: window.open with a fully-qualified URL works for
		// https links even when tabs API is absent (e.g. during early
		// boot or in degraded environments).
		if (/^https?:\/\//i.test(url)) {
			window.open(url, "_blank", "noopener,noreferrer");
		} else {
			console.warn(`[host] openInNewTab: tabs API unavailable and ${url} is not http(s)`);
		}
	} catch (err) {
		console.warn(`[host] openInNewTab(${url}) failed:`, err);
	}
}
