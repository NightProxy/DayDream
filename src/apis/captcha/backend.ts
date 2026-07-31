/**
 * Thin backend client for the Night+ captcha solver endpoints.
 *
 * Mirrors Daylight's architecture exactly (see
 * `Daylight/src/lib/turnstile/widgetSolver.ts` and `wispFetch.ts`):
 * the captcha endpoints live on `https://nightplus.night-x.com/v1/captcha/*`
 * and we call them with the absolute URL. There is intentionally no
 * same-origin proxy route — Daylight doesn't have one and the SW
 * routing in DDX (`src/core/sw/index.ts`) would otherwise have to
 * special-case the path and end up tunneling stale builds to production.
 *
 * Transport: we route through the active proxy tunnel via
 * `window.proxy.fetch` (which delegates to libcurl or Pulsar over
 * Wisp, see `src/apis/proxy.ts:775-815`). Two reasons we do not use
 * the browser's native `fetch`:
 *   1. CORS — the Night+ host doesn't (and shouldn't) whitelist every
 *      DDX deployment origin.
 *   2. Consistency — every other "call upstream from the host page"
 *      site in DDX uses `window.proxy.fetch` for the same reason
 *      (see `src/browser/tabs/manipulation.ts:128`,
 *      `src/pages/settings/index.tsx:1251`, etc.).
 *
 * If the proxy isn't ready yet (boot race), `solveCaptcha` surfaces
 * a clean `proxy_unavailable` error and the hook hands it to the
 * page's error-callback, which falls back to the real captcha UI.
 */

import { getAccessToken } from '@apis/nightplus';

const UPSTREAM_BASE = 'https://nightplus.night-x.com/v1';

/** Shape of the page→host solve request payload (see hook.runtime.js). */
export interface SolveRequest {
	requestId: string;
	type: string;
	sitekey: string;
	pageUrl: string;
	userAgent?: string | null;
	action?: string | null;
	cData?: string | null;
	invisible?: boolean;
	enterprise?: boolean;
	minScore?: number;
}

/** Backend success shape (one of these per captcha endpoint). */
interface SolveSuccess {
	token: string;
}

/** Backend error shape — either `{error: ...}` or non-2xx HTTP. */
interface SolveFailure {
	error: string;
}

/**
 * The proxy facade we depend on. Matches the shape exposed on
 * `window.proxy` (see `src/apis/proxy.ts:775`). Typed loosely so we
 * don't pull in the full Proxy class type.
 */
interface ProxyFetchFacade {
	fetch(
		url: string,
		method?: string,
		body?: unknown,
		headers?: [string, string][]
	): Promise<Response>;
}

function getProxy(): ProxyFetchFacade | null {
	const w = window as unknown as { proxy?: ProxyFetchFacade };
	if (w.proxy && typeof w.proxy.fetch === 'function') {
		return w.proxy;
	}
	// Inside a proxied frame, `parent.proxy` is the host's proxy.
	try {
		const p = (window.parent as unknown as { proxy?: ProxyFetchFacade })
			?.proxy;
		if (p && typeof p.fetch === 'function') return p;
	} catch {
		// cross-realm access threw — ignore.
	}
	return null;
}

/**
 * Map a captcha-type string into a backend path segment and
 * version-discriminator body field. Returns null for unknown types so
 * the bridge can reject early without making a network call.
 */
function endpointFor(type: string): {
	path: string;
	extraBody?: Record<string, unknown>;
} | null {
	switch (type) {
		case 'turnstile':
			return { path: '/captcha/turnstile' };
		case 'hcaptcha':
			return { path: '/captcha/hcaptcha' };
		case 'recaptcha-v2':
			return { path: '/captcha/recaptcha', extraBody: { version: 'v2' } };
		case 'recaptcha-v3':
			return { path: '/captcha/recaptcha', extraBody: { version: 'v3' } };
		case 'recaptcha-enterprise':
			return {
				path: '/captcha/recaptcha',
				extraBody: { version: 'enterprise' }
			};
		default:
			return null;
	}
}

/**
 * Build the request body the backend expects. Strips `requestId` and
 * `type` (those are protocol-internal, not backend-relevant) and
 * appends any version discriminator.
 */
function buildBody(req: SolveRequest, extra?: Record<string, unknown>): string {
	const { requestId: _req, type: _type, ...rest } = req;
	void _req;
	void _type;
	return JSON.stringify({ ...rest, ...(extra ?? {}) });
}

/**
 * One-shot solve. Returns the token on success; throws `Error(<code>)`
 * on failure. Error codes the bridge surfaces to the page:
 *   - `unauthorized`             (caller should pre-check; surfaced here too)
 *   - `unsupported_type`         (unknown captcha type)
 *   - `proxy_unavailable`        (window.proxy not initialized yet)
 *   - `endpoint_not_found`       (404 from backend — feature not deployed)
 *   - `solver_failed`            (backend returned `{error: ...}` or non-2xx)
 *   - `network_error`            (proxy fetch threw)
 *   - `malformed_response`       (backend gave 2xx but no token)
 */
export async function solveCaptcha(req: SolveRequest): Promise<string> {
	const endpoint = endpointFor(req.type);
	if (!endpoint) {
		throw new Error('unsupported_type');
	}

	const token = await getAccessToken();
	if (!token) {
		throw new Error('unauthorized');
	}

	const proxy = getProxy();
	if (!proxy) {
		console.warn('[captcha-backend] window.proxy is not available');
		throw new Error('proxy_unavailable');
	}

	const url = `${UPSTREAM_BASE}${endpoint.path}`;
	const body = buildBody(req, endpoint.extraBody);
	const headers: [string, string][] = [
		['content-type', 'application/json'],
		['authorization', `Bearer ${token}`]
	];

	let response: Response;
	try {
		response = await proxy.fetch(url, 'POST', body, headers);
	} catch (err) {
		console.warn('[captcha-backend] network error:', err);
		throw new Error('network_error');
	}

	if (response.status === 404) {
		throw new Error('endpoint_not_found');
	}
	if (response.status === 401) {
		throw new Error('unauthorized');
	}

	let payload: SolveSuccess | SolveFailure | null = null;
	try {
		payload = (await response.json()) as SolveSuccess | SolveFailure;
	} catch {
		// non-JSON body — treat as malformed
	}

	if (!response.ok) {
		const err =
			payload && 'error' in payload && typeof payload.error === 'string'
				? payload.error
				: 'solver_failed';
		throw new Error(err);
	}

	if (
		!payload ||
		!('token' in payload) ||
		typeof payload.token !== 'string' ||
		payload.token.length === 0
	) {
		throw new Error('malformed_response');
	}

	return payload.token;
}

// ---------- CF clearance ----------

export interface CfClearanceCookie {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: number;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: 'Lax' | 'Strict' | 'None';
}

export interface CfClearanceResult {
	cookies: CfClearanceCookie[];
	userAgent: string;
}

/**
 * Backend call for full-page CF block clearance. Returns the cookies
 * (typically `cf_clearance` + companions) and the User-Agent the
 * backend Playwright used — both must be injected into the proxied
 * frame before the next request, otherwise CF rejects.
 *
 * Throws the same coded errors as `solveCaptcha`.
 */
export async function clearCloudflareFor(
	url: string,
	userAgent: string
): Promise<CfClearanceResult> {
	const token = await getAccessToken();
	if (!token) throw new Error('unauthorized');

	const proxy = getProxy();
	if (!proxy) {
		console.warn(
			'[captcha-backend] cf-clearance: window.proxy is not available'
		);
		throw new Error('proxy_unavailable');
	}

	const endpoint = `${UPSTREAM_BASE}/captcha/cf-clearance`;
	const headers: [string, string][] = [
		['content-type', 'application/json'],
		['authorization', `Bearer ${token}`]
	];
	const body = JSON.stringify({ url, userAgent });

	let response: Response;
	try {
		response = await proxy.fetch(endpoint, 'POST', body, headers);
	} catch (err) {
		console.warn('[captcha-backend] cf-clearance network error:', err);
		throw new Error('network_error');
	}

	if (response.status === 404) throw new Error('endpoint_not_found');
	if (response.status === 401) throw new Error('unauthorized');

	let payload: CfClearanceResult | { error?: string } | null = null;
	try {
		payload = (await response.json()) as CfClearanceResult;
	} catch {
		// non-JSON
	}

	if (!response.ok) {
		const err =
			payload && 'error' in payload && typeof payload.error === 'string'
				? payload.error
				: 'solver_failed';
		throw new Error(err);
	}

	if (
		!payload ||
		!('cookies' in payload) ||
		!Array.isArray(payload.cookies) ||
		typeof (payload as CfClearanceResult).userAgent !== 'string'
	) {
		throw new Error('malformed_response');
	}

	return payload as CfClearanceResult;
}
