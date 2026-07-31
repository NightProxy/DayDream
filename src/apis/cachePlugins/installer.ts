/**
 * installCachePluginManager(controller, manager)
 *
 * Wraps `controller.createFrame` so that every newly-created proxied
 * frame gets one `HttpCachePlugin` attached, configured to delegate
 * per-request decisions to the manager.
 *
 * Why "always attach, decide per-request"?
 * ----------------------------------------
 * Frames are created BEFORE the omnibox knows the URL — `proxy.createFrame`
 * runs at frame-element insertion time, then `proxy.navigateFrame` is
 * called later with the target URL. We could hook the navigation step and
 * decide on plugin attachment per-URL, but the simpler model is to attach
 * one plugin per frame unconditionally and let the plugin's request hook
 * consult the manager's `policyFor(url)` on each fetch. That's cheap (a
 * single hostname lookup per request) and matches how real browser HTTP
 * caches work — the cache layer is always present; what changes is the
 * per-request decision to use it.
 *
 * Idempotent. Re-invocation is a no-op.
 */

import type { CachePluginManager } from './manager';
import { createHttpCachePlugin } from './plugins/http-cache-plugin';

let installed = false;

export function installCachePluginManager(
	controller: unknown,
	manager: CachePluginManager
): void {
	if (installed) return;
	if (!controller) {
		console.warn(
			'[cachePluginManager] install called with no controller; skipping'
		);
		return;
	}

	const ctl = controller as {
		createFrame?: (
			element?: HTMLIFrameElement,
			options?: { plugins?: unknown[] }
		) => unknown;
		frames?: unknown[];
	};

	const original = ctl.createFrame;
	if (typeof original !== 'function') {
		console.warn(
			'[cachePluginManager] controller.createFrame missing; install skipped'
		);
		return;
	}

	const bound = original.bind(ctl);

	const buildPlugin = () =>
		createHttpCachePlugin({
			policyResolver: (url: string) => manager.policyFor(url),
			isEnabled: () => manager.isEnabled()
		});

	ctl.createFrame = (
		element?: HTMLIFrameElement,
		options: { plugins?: unknown[] } = {}
	) => {
		// Merge: keep any caller-supplied plugins, append ours.
		// `buildPlugin()` returns null only if the controller IIFE never
		// loaded (e.g. scramjet boot failure) — in that case skip the
		// cache plugin and proxy through unchanged.
		const ours = buildPlugin();
		const pluginsIn = Array.isArray(options.plugins) ? options.plugins : [];
		const merged = ours ? [...pluginsIn, ours] : pluginsIn;
		try {
			const frame = bound(element, { ...options, plugins: merged });
			try {
				console.log(
					'[cachePluginManager] frame created with cache plugin attached (enabled=' +
						manager.isEnabled() +
						')'
				);
			} catch {}
			return frame;
		} catch (err) {
			console.warn(
				'[cachePluginManager] createFrame with cache plugin threw; falling back to no-cache:',
				err
			);
			// Fall back to the un-wrapped createFrame if the controller
			// rejects our options shape (defensive — should not happen with
			// the current vendored controller which has FrameOptions support).
			return bound(element, options);
		}
	};

	installed = true;
	try {
		console.log(
			'[cachePluginManager] installed (enabled=' +
				manager.isEnabled() +
				', backend=cache-storage, policies=' +
				manager.listPolicies().length +
				')'
		);
	} catch {}
}
