/**
 * Cloudflare full-page-block clearance.
 *
 * Distinct from the in-page captcha widget interception (`bridge.ts` +
 * `hook.runtime.js`). This module handles the case where the entire
 * page is a CF challenge — there is no widget to intercept, only the
 * challenge page itself, and the only path forward is getting the
 * `cf_clearance` cookie injected and reloading.
 *
 * Detection
 * ---------
 * Subscribes to the `iframeLoaded` CustomEvent dispatched by
 * `src/browser/tabs/lifecycle.ts:143-150`. Per (tabId, decoded-url),
 * counts loads in a sliding 8 s window. ≥3 loads → CF reload-loop.
 * Different URLs reset the counter for that tab.
 *
 * Action (Night+ only)
 * --------------------
 * 1. Resolve the upstream URL via `decodeProxiedUrl(iframe.src, proxy)`.
 * 2. Call backend `nightplus.night-x.com/v1/captcha/cf-clearance {url, userAgent}`
 *    (via `window.proxy.fetch` — same as Daylight's wispFetch pattern).
 * 3. Inject the returned cookies into `controller.cookieJar` for the URL's
 *    origin (`./cookieInject.ts`).
 * 4. Re-navigate the tab to the same URL. The next request carries the
 *    new cookies and CF lets it through.
 *
 * Failure modes
 * -------------
 * - Not Night+: skip step 2-4 silently. Detector still runs (cheap).
 *   A v2 UI piece can show "sign in to Night+" here.
 * - Backend error: log, reset the per-tab tracker for the URL so we
 *   don't thrash. Tab is NOT reloaded.
 * - Cookie inject fails: log and stop. Tab is NOT reloaded.
 */

import { decodeProxiedUrl } from '@browser/tabs/urlDecoder';
import { checkNightPlusStatus } from '@apis/nightplus';
import { clearCloudflareFor, type CfClearanceResult } from './backend';
import { injectCfClearanceCookies } from './cookieInject';

const WINDOW_MS = 8_000;
const LOOP_THRESHOLD = 3;

interface PerTabState {
	currentUrl: string;
	timestamps: number[];
	clearing: boolean;
}

export interface CfClearanceWatcherDeps {
	/** Scramjet controller — needs `.cookieJar.setCookies(...)`. */
	controller: unknown;
	/**
	 * The proxy facade (typically `window.proxy`). We pass it whole so
	 * `decodeProxiedUrl` can do its codec lookup; we also call
	 * `proxy.navigateFrame` to reload the tab.
	 */
	proxy: {
		navigateFrame(target: HTMLIFrameElement | string, url: string): Promise<boolean>;
	};
	/** Test seam for the gate. Default = real `checkNightPlusStatus`. */
	checkNightPlusStatus?: () => Promise<boolean>;
	/** Test seam for the backend call. Default = real `clearCloudflareFor`. */
	clearCloudflareFor?: (
		url: string,
		userAgent: string
	) => Promise<CfClearanceResult>;
}

export interface CfClearanceWatcherStats {
	cfBlockDetections: number;
	clearanceAttempts: number;
	clearanceSuccesses: number;
	clearanceFailures: number;
}

export class CfClearanceWatcher {
	private deps: Required<CfClearanceWatcherDeps>;
	private perTab = new Map<string, PerTabState>();
	private listener: ((event: Event) => void) | null = null;
	private stats: CfClearanceWatcherStats = {
		cfBlockDetections: 0,
		clearanceAttempts: 0,
		clearanceSuccesses: 0,
		clearanceFailures: 0
	};

	constructor(deps: CfClearanceWatcherDeps) {
		this.deps = {
			controller: deps.controller,
			proxy: deps.proxy,
			checkNightPlusStatus:
				deps.checkNightPlusStatus ?? checkNightPlusStatus,
			clearCloudflareFor: deps.clearCloudflareFor ?? clearCloudflareFor
		};
	}

	install(): () => void {
		this.listener = (event: Event) => this.onIframeLoaded(event);
		document.addEventListener('iframeLoaded', this.listener);
		return () => this.uninstall();
	}

	uninstall(): void {
		if (this.listener) {
			document.removeEventListener('iframeLoaded', this.listener);
			this.listener = null;
		}
		this.perTab.clear();
	}

	getStats(): CfClearanceWatcherStats {
		return { ...this.stats };
	}

	/**
	 * Manual trigger. Useful for `window.captcha.bustCfFor(url)` or
	 * tests. Bypasses the load-loop heuristic entirely.
	 */
	async runManualClearance(
		iframe: HTMLIFrameElement,
		decodedUrl: string
	): Promise<{ cleared: boolean; reason?: string }> {
		return this.runClearance(iframe, decodedUrl, /* gateOnNightPlus */ true);
	}

	/**
	 * Internal: run the heuristic for one iframeLoaded event.
	 */
	private async onIframeLoaded(event: Event): Promise<void> {
		const ce = event as CustomEvent<{
			tabId: string;
			iframe: HTMLIFrameElement;
			tabElement: HTMLElement;
		}>;
		const { tabId, iframe } = ce.detail;
		if (!tabId || !iframe || !iframe.src) return;

		// Decode upstream URL; ignore non-proxied loads (internal pages).
		const decoded = this.safeDecode(iframe.src);
		if (!decoded || !this.isHttpUrl(decoded)) return;

		const now = Date.now();
		const prev = this.perTab.get(tabId);
		let state: PerTabState;
		if (!prev || prev.currentUrl !== decoded) {
			state = { currentUrl: decoded, timestamps: [now], clearing: false };
		} else {
			// Trim the sliding window then push.
			state = prev;
			state.timestamps = state.timestamps.filter(
				(t) => now - t <= WINDOW_MS
			);
			state.timestamps.push(now);
		}
		this.perTab.set(tabId, state);

		if (state.clearing) return;
		if (state.timestamps.length < LOOP_THRESHOLD) return;

		// Reload-loop on the same URL detected.
		this.stats.cfBlockDetections += 1;
		try {
			console.warn(
				`[cf-clearance] CF reload-loop detected on tab ${tabId} for ${decoded} (${state.timestamps.length} loads in ${WINDOW_MS}ms)`
			);
		} catch {}
		state.clearing = true;
		try {
			await this.runClearance(iframe, decoded, /* gateOnNightPlus */ true);
		} finally {
			// Reset the timestamp series so a successful clearance that
			// triggers one more load doesn't immediately re-fire.
			state.timestamps = [];
			state.clearing = false;
			this.perTab.set(tabId, state);
		}
	}

	private async runClearance(
		iframe: HTMLIFrameElement,
		decodedUrl: string,
		gateOnNightPlus: boolean
	): Promise<{ cleared: boolean; reason?: string }> {
		if (gateOnNightPlus) {
			try {
				const authed = await this.deps.checkNightPlusStatus();
				if (!authed) {
					return { cleared: false, reason: 'unauthorized' };
				}
			} catch (err) {
				console.warn('[cf-clearance] auth check failed:', err);
				return { cleared: false, reason: 'auth_check_failed' };
			}
		}

		this.stats.clearanceAttempts += 1;
		let result: CfClearanceResult;
		try {
			result = await this.deps.clearCloudflareFor(
				decodedUrl,
				navigator.userAgent
			);
		} catch (err) {
			this.stats.clearanceFailures += 1;
			const reason = err instanceof Error ? err.message : 'solver_failed';
			console.warn(`[cf-clearance] backend call failed: ${reason}`);
			return { cleared: false, reason };
		}

		const ok = injectCfClearanceCookies(
			this.deps.controller,
			decodedUrl,
			result.cookies
		);
		if (!ok) {
			this.stats.clearanceFailures += 1;
			return { cleared: false, reason: 'cookie_inject_failed' };
		}

		// Re-navigate the iframe so the new cookie is sent on the next request.
		try {
			await this.deps.proxy.navigateFrame(iframe, decodedUrl);
		} catch (err) {
			this.stats.clearanceFailures += 1;
			console.warn('[cf-clearance] navigateFrame after cookie inject failed:', err);
			return { cleared: false, reason: 'navigate_failed' };
		}

		this.stats.clearanceSuccesses += 1;
		return { cleared: true };
	}

	private safeDecode(src: string): string | null {
		try {
			return decodeProxiedUrl(src, this.deps.proxy as unknown as never);
		} catch {
			return null;
		}
	}

	private isHttpUrl(url: string): boolean {
		try {
			const u = new URL(url);
			return u.protocol === 'http:' || u.protocol === 'https:';
		} catch {
			return false;
		}
	}
}
