/**
 * Inject CF-clearance cookies into the scramjet controller's CookieJar.
 *
 * The vendored controller exposes a `cookieJar` instance with a
 * `setCookies(cookieString, url)` method (see
 * `src/core/SJ/controller/src/index.ts:224, 570`). It accepts a raw
 * `Set-Cookie`-style string. We serialize the structured cookies
 * returned by the backend into that format and call setCookies once
 * per cookie for clarity.
 *
 * If the controller surface is missing (e.g. early-boot race), this
 * module logs and returns false so the caller can decide whether to
 * fall back. We do not throw — failed cookie injection is a soft
 * failure (the user just doesn't get the CF clearance).
 */

import type { CfClearanceCookie } from './backend';

/** Subset of the controller surface we depend on. */
interface ControllerWithCookieJar {
	cookieJar?: {
		setCookies(cookieString: string, url: URL): void;
	};
}

/**
 * Serialize one structured cookie into a `Set-Cookie`-style string.
 * Only includes attributes the backend payload exposes; leaves the
 * rest to the CookieJar's defaults.
 */
export function serializeCookie(c: CfClearanceCookie): string {
	const parts = [`${c.name}=${c.value}`];
	if (c.domain) parts.push(`Domain=${c.domain}`);
	if (c.path) parts.push(`Path=${c.path}`);
	if (typeof c.expires === 'number' && Number.isFinite(c.expires)) {
		// `expires` from CF/Playwright is unix seconds. Convert to RFC 7231
		// http-date format.
		try {
			parts.push(`Expires=${new Date(c.expires * 1000).toUTCString()}`);
		} catch {
			// drop the expires part on bad input
		}
	}
	if (c.secure) parts.push('Secure');
	if (c.httpOnly) parts.push('HttpOnly');
	if (c.sameSite) parts.push(`SameSite=${c.sameSite}`);
	return parts.join('; ');
}

/**
 * Inject the cookies into the controller's jar for the given URL's origin.
 * Returns true if at least one cookie was successfully written.
 */
export function injectCfClearanceCookies(
	controller: unknown,
	pageUrl: string,
	cookies: CfClearanceCookie[]
): boolean {
	const ctl = controller as ControllerWithCookieJar | null | undefined;
	const jar = ctl?.cookieJar;
	if (!jar || typeof jar.setCookies !== 'function') {
		console.warn(
			'[cf-clearance] controller.cookieJar.setCookies is unavailable; cannot inject cookies'
		);
		return false;
	}

	let url: URL;
	try {
		url = new URL(pageUrl);
	} catch (err) {
		console.warn('[cf-clearance] invalid url for cookie inject:', err);
		return false;
	}

	let any = false;
	for (const c of cookies) {
		if (!c || typeof c.name !== 'string' || typeof c.value !== 'string') {
			continue;
		}
		try {
			jar.setCookies(serializeCookie(c), url);
			any = true;
		} catch (err) {
			console.warn(
				`[cf-clearance] setCookies failed for ${c.name}:`,
				err
			);
		}
	}
	return any;
}
