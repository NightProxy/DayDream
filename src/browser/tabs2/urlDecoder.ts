/**
 * Centralized proxied-URL decoder.
 *
 * The browser uses Scramjet (and historically Ultraviolet) to rewrite URLs
 * loaded inside iframes. The "real" URL the user thinks they're on lives
 * inside the iframe's `src`/`location.href` after a proxy-specific prefix
 * and codec. We have to undo that any time we want to:
 *   - show the URL in the address bar
 *   - persist it (history, bookmarks, session save)
 *   - re-open it (duplicate tab, restore session)
 *   - compare it for identity / change detection
 *
 * Prior to this helper, six different sites each had their own copy of the
 * decode logic, with subtly different fallback chains. This is the single
 * source of truth.
 *
 * Resolution order (each step bails out on success):
 *   1. Already a registered protocol URL (ddx://, etc.) or contains
 *      `/internal/` — return as-is.
 *   2. If the URL matches the active iframe's src, ask the proxy to extract
 *      using that iframe's per-frame prefix (most accurate for v2 Scramjet).
 *   3. Walk every registered proxy controller frame and try its prefix.
 *   4. Legacy SWconfig-global-prefix path (v1 Scramjet / Ultraviolet).
 *   5. Give up and return the input unchanged.
 *
 * Always returns a string; never throws.
 */
export function decodeProxiedUrl(url: string, proxy?: any): string {
	if (!url) return url;

	try {
		// Step 1: already-decoded internal/protocol URLs pass through.
		if (
			(globalThis as any).protocols?.isRegisteredProtocol?.(url) ||
			url.includes('/internal/')
		) {
			return url;
		}

		const resolvedProxy = proxy ?? (globalThis as any).proxy;

		// Step 2: try the currently-active iframe (v2 per-frame prefix).
		try {
			const activeIframe = document.querySelector(
				'iframe.active'
			) as HTMLIFrameElement | null;
			if (
				resolvedProxy?.extractEncodedUrl &&
				activeIframe &&
				url === activeIframe.src
			) {
				const decoded = resolvedProxy.extractEncodedUrl(activeIframe);
				if (decoded) return decoded;
			}
		} catch {
			// fall through
		}

		// Step 3: walk registered frames.
		try {
			const frames = resolvedProxy?.controller?.frames;
			if (frames && resolvedProxy.extractEncodedUrl) {
				for (const frame of frames) {
					if (frame?.prefix && url.includes(frame.prefix)) {
						const decoded = resolvedProxy.extractEncodedUrl(
							frame.element,
							{ url, prefix: frame.prefix }
						);
						if (decoded) return decoded;
					}
				}
			}
		} catch {
			// fall through
		}

		// Step 4: SWconfig-global-prefix legacy fallback.
		try {
			const swc = (globalThis as any).SWconfig;
			const ps = (globalThis as any).ProxySettings;
			if (swc && ps) {
				const cfg = swc[ps];
				const prefix = cfg?.config?.prefix;
				if (prefix && url.includes(prefix)) {
					const path = new URL(url).pathname.replace(prefix, '');
					if (resolvedProxy?.decodeUrl) {
						const decoded = resolvedProxy.decodeUrl(path);
						if (decoded) return decoded;
					}
				}
			}
		} catch {
			// fall through
		}

		return url;
	} catch (error) {
		console.warn('[urlDecoder] Failed to decode proxied URL:', error);
		return url;
	}
}

/**
 * Convenience: decode the URL currently loaded in an iframe.
 *
 * Prefers the live `contentWindow.location.href` (post-redirect, post-hash)
 * but transparently falls back to `iframe.src` if cross-origin access is
 * blocked. Always passed through `decodeProxiedUrl` before being returned.
 *
 * Returns an empty string if the iframe is missing.
 */
export function decodeIframeUrl(
	iframe: HTMLIFrameElement | null | undefined,
	proxy?: any
): string {
	if (!iframe) return '';
	let raw = '';
	try {
		raw = iframe.contentWindow?.location?.href || iframe.src || '';
	} catch {
		raw = iframe.src || '';
	}
	if (!raw || raw === 'about:blank') return raw;
	return decodeProxiedUrl(raw, proxy);
}
