/**
 * Night+ Captcha plugin for Scramjet — public entry point.
 *
 * Spec: `docs/superpowers/specs/2026-06-07-night-plus-captcha-plugin-design.md`
 *
 * Composition (see the spec's architecture section for the full diagram):
 *
 *   `installCaptcha({controller, proxy})` →
 *     - registers `hook.runtime.js` with `scriptInjectionRegistry`
 *       (every proxied page gets the hook before any page script runs),
 *     - installs `CaptchaBridge` (page→host RPC channel + Night+ gate
 *       + backend call),
 *     - installs `CfClearanceWatcher` (load-loop detector +
 *       cf_clearance cookie inject + tab reload),
 *     - returns a `CaptchaManager` with diagnostic / manual-trigger
 *       methods that get mounted on `window.captcha`.
 *
 * Public window surface (`window.captcha`):
 *   - `reinstallHook()`        — re-register the hook if the registry was reset
 *   - `bustCfFor(url)`         — manually trigger CF clearance for the active tab
 *   - `stats()`                — bridge + clearance counters
 *   - `pending()`              — currently in-flight solve requests
 */

import {
	scriptInjectionRegistry,
	type InjectableScript
} from '@apis/scriptInjection';

import { CaptchaBridge, type CaptchaStats, type PendingSolve } from './bridge';
import {
	CfClearanceWatcher,
	type CfClearanceWatcherStats
} from './cfClearance';
import { CAPTCHA_HOOK_SOURCE } from './hookSource';

const REGISTRY_ID = 'ddx-captcha-hook';

export interface InstallCaptchaDeps {
	controller: unknown;
	proxy: {
		navigateFrame(
			target: HTMLIFrameElement | string,
			url: string
		): Promise<boolean>;
	};
}

export interface CaptchaManagerStats {
	bridge: CaptchaStats;
	cfClearance: CfClearanceWatcherStats;
}

export interface PendingSolveInfo extends PendingSolve {
	ageMs: number;
}

export class CaptchaManager {
	private bridge: CaptchaBridge;
	private cfWatcher: CfClearanceWatcher;
	private uninstallBridge: () => void;
	private uninstallCf: () => void;

	constructor(deps: InstallCaptchaDeps) {
		// Pass the controller through so the bridge can use it for
		// future per-frame features (stats, diagnostics). Reply routing
		// itself doesn't need it — see CaptchaBridge.makeReplyTransport.
		this.bridge = new CaptchaBridge({ controller: deps.controller });
		this.cfWatcher = new CfClearanceWatcher({
			controller: deps.controller,
			proxy: deps.proxy
		});
		registerHook();
		this.uninstallBridge = this.bridge.install();
		this.uninstallCf = this.cfWatcher.install();
		installDebugListener();
	}

	/** Re-register the in-page hook with `scriptInjectionRegistry`. */
	reinstallHook(): void {
		registerHook();
	}

	/**
	 * Manual trigger for a CF clearance + reload of the active tab.
	 * Returns `{cleared, reason?}` so the caller can surface it.
	 */
	async bustCfFor(url: string): Promise<{ cleared: boolean; reason?: string }> {
		const iframe = activeIframeOrNull();
		if (!iframe) {
			return { cleared: false, reason: 'no_active_iframe' };
		}
		return this.cfWatcher.runManualClearance(iframe, url);
	}

	stats(): CaptchaManagerStats {
		return {
			bridge: this.bridge.getStats(),
			cfClearance: this.cfWatcher.getStats()
		};
	}

	pending(): PendingSolveInfo[] {
		const now = Date.now();
		return this.bridge.getPending().map((p) => ({
			...p,
			ageMs: now - p.startedAt
		}));
	}

	/** Test/teardown hook. */
	uninstall(): void {
		this.uninstallBridge();
		this.uninstallCf();
		scriptInjectionRegistry.unregister(REGISTRY_ID);
	}
}

/**
 * Install the full captcha system. Construct once at boot, after the
 * proxy controller is ready, and store the returned manager on
 * `window.captcha`.
 */
export function installCaptcha(deps: InstallCaptchaDeps): CaptchaManager {
	return new CaptchaManager(deps);
}

// ---------- internals ----------

function registerHook(): void {
	const inline: InjectableScript = {
		kind: 'inline',
		code: CAPTCHA_HOOK_SOURCE
	};
	scriptInjectionRegistry.register({
		id: REGISTRY_ID,
		match: () => true,
		scripts: [inline]
	});
}

/**
 * Find the active tab's iframe (the one with `.active` per
 * `lifecycle.ts:548`). Returns null if no tab is active.
 */
function activeIframeOrNull(): HTMLIFrameElement | null {
	try {
		return document.querySelector<HTMLIFrameElement>('iframe.active');
	} catch {
		return null;
	}
}

/**
 * Opt-in capture-phase `message` listener that logs every
 * postMessage the host receives. Useful for diagnosing whether
 * proxied-page messages are reaching the host at all (e.g. when
 * scramjet's Window.postMessage wrapper drops or transforms them).
 *
 * Enable: set `window.__ddx_captcha_debug = true` BEFORE the page
 * loads (e.g. in a console snippet, before navigating). Reload the
 * page. Every `message` event will log to the host console with the
 * marker `[captcha-debug]`.
 *
 * Disable: `window.__ddx_captcha_debug = false`. The listener stays
 * installed but stops logging — toggle freely without reloading.
 */
let debugListenerInstalled = false;
function installDebugListener(): void {
	if (debugListenerInstalled) return;
	debugListenerInstalled = true;
	try {
		window.addEventListener(
			'message',
			(event) => {
				if (
					!(window as unknown as { __ddx_captcha_debug?: boolean })
						.__ddx_captcha_debug
				) {
					return;
				}
				try {
					const isSelf = event.source === window;
					const data = event.data;
					let summary: string;
					if (data && typeof data === 'object') {
						const keys = Object.keys(data);
						summary = `keys=[${keys.join(', ')}]`;
					} else {
						summary = `data=${typeof data}`;
					}
					console.log(
						`[captcha-debug] message origin=${event.origin || '(empty)'} self=${isSelf} ports=${event.ports?.length ?? 0} ${summary}`
					);
				} catch {}
			},
			{ capture: true }
		);
	} catch {}
}

// Re-exports for tests / advanced consumers.
export { CaptchaBridge } from './bridge';
export type { CaptchaStats, PendingSolve, CaptchaBridgeDeps } from './bridge';
export { CfClearanceWatcher } from './cfClearance';
export type { CfClearanceWatcherDeps, CfClearanceWatcherStats } from './cfClearance';
export {
	REQ_MARKER,
	RES_MARKER,
	HOOK_READY_MARKER,
	HOOK_INSTALLED_FLAG
} from './markers';
export { solveCaptcha, clearCloudflareFor } from './backend';
export type { SolveRequest, CfClearanceCookie, CfClearanceResult } from './backend';
export {
	serializeCookie,
	injectCfClearanceCookies
} from './cookieInject';
