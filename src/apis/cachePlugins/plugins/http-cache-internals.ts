/**
 * RFC-9111-ish HTTP cache logic, ported from the upstream
 * `HttpCachePlugin` (vendored at `src/core/SJ/utils/src/http-cache-plugin.ts`).
 *
 * This file holds the pure "is it cacheable?" / "is it fresh?" /
 * "build a key" helpers. They're independent of any storage substrate
 * so the plugin (`./http-cache-plugin.ts`) stays small and the logic
 * is unit-testable on its own.
 *
 * Behavioural notes that intentionally mirror upstream:
 *   - GET/HEAD only.
 *   - Cacheable statuses: 200 203 204 300 301 308 404 405 410 414 501.
 *     206 omitted (partial responses are rejected by the Cache API spec).
 *   - `Cache-Control: no-store` and `Vary: *` opt out of storage.
 *   - Freshness lifetime: s-maxage → max-age → Expires → 10% heuristic
 *     (RFC 9111 §4.2.1 + §4.2.2).
 *   - `no-cache`, `Pragma: no-cache`, `request.cache === "no-cache"`
 *     force a revalidation-before-use (we treat as a miss in v1).
 *   - `Cache-Control: immutable` (RFC 8246) short-circuits freshness
 *     unless the client explicitly asked for a refresh.
 *
 * 304 revalidation isn't implemented (matches upstream).
 */

/** Header tagged onto stored responses to compute Age on retrieval. */
export const STORED_AT_HEADER = 'x-sj-cached-at';

/** Cacheable-by-default statuses, RFC 9110 §15.1, minus 206. */
export const DEFAULT_CACHEABLE_STATUSES = new Set([
	200, 203, 204, 300, 301, 308, 404, 405, 410, 414, 501
]);

/** Statuses for which the Fetch spec forbids a body. */
export const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export interface CacheControlDirectives {
	'no-store'?: boolean;
	'no-cache'?: boolean;
	'must-revalidate'?: boolean;
	'proxy-revalidate'?: boolean;
	private?: boolean;
	public?: boolean;
	'max-age'?: number;
	's-maxage'?: number;
	'stale-while-revalidate'?: number;
	'stale-if-error'?: number;
	immutable?: boolean;
}

export function parseCacheControl(
	value: string | null
): CacheControlDirectives {
	const out: CacheControlDirectives = {};
	if (!value) return out;
	for (const raw of value.split(',')) {
		const part = raw.trim();
		if (!part) continue;
		const eq = part.indexOf('=');
		const name = (eq === -1 ? part : part.slice(0, eq))
			.trim()
			.toLowerCase() as keyof CacheControlDirectives;
		if (eq === -1) {
			(out as Record<string, unknown>)[name] = true;
			continue;
		}
		let v = part.slice(eq + 1).trim();
		if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
		if (
			name === 'max-age' ||
			name === 's-maxage' ||
			name === 'stale-while-revalidate' ||
			name === 'stale-if-error'
		) {
			const n = parseInt(v, 10);
			if (Number.isFinite(n) && n >= 0) {
				(out as Record<string, unknown>)[name] = n;
			}
		} else {
			(out as Record<string, unknown>)[name] = true;
		}
	}
	return out;
}

/** RFC 9111 §4.2.1 + §4.2.2 freshness lifetime, simplified for private cache. */
export function freshnessLifetimeSeconds(
	headers: Headers,
	cc: CacheControlDirectives,
	dateMs: number
): number | null {
	if (cc['s-maxage'] !== undefined) return cc['s-maxage'];
	if (cc['max-age'] !== undefined) return cc['max-age'];

	const expires = headers.get('expires');
	if (expires) {
		const expMs = Date.parse(expires);
		if (Number.isFinite(expMs)) {
			return Math.max(0, (expMs - dateMs) / 1000);
		}
	}

	const lastModified = headers.get('last-modified');
	if (lastModified) {
		const lmMs = Date.parse(lastModified);
		if (Number.isFinite(lmMs) && lmMs <= dateMs) {
			return ((dateMs - lmMs) * 0.1) / 1000;
		}
	}

	return null;
}

export function currentAgeSeconds(
	headers: Headers,
	storedAtMs: number
): number {
	const ageHeader = headers.get('age');
	const initialAge = ageHeader ? parseInt(ageHeader, 10) || 0 : 0;
	const residentTime = (Date.now() - storedAtMs) / 1000;
	return initialAge + residentTime;
}

export function isCacheableMethod(method: string): boolean {
	return method === 'GET' || method === 'HEAD';
}

/**
 * Whether a response is allowed to be stored. `headers` is the upstream's
 * raw response headers (pre-rewrite).
 */
export function responseIsStorable(
	status: number,
	headers: Headers,
	method: string
): boolean {
	if (!isCacheableMethod(method)) return false;
	if (!DEFAULT_CACHEABLE_STATUSES.has(status)) return false;

	const cc = parseCacheControl(headers.get('cache-control'));
	if (cc['no-store']) return false;

	const vary = headers.get('vary');
	if (vary && vary.split(',').some((v) => v.trim() === '*')) return false;

	return true;
}

/**
 * Decide whether a stored response is fresh enough to serve.
 * Returns `{ fresh, immutable }` separately so the caller can apply
 * `immutable` short-circuit logic.
 */
export function evaluateFreshness(
	storedHeaders: Headers,
	storedAtMs: number,
	requestCacheMode: string
): { fresh: boolean; immutable: boolean; mustRevalidate: boolean } {
	const cc = parseCacheControl(storedHeaders.get('cache-control'));

	const pragmaNoCache = (storedHeaders.get('pragma') ?? '')
		.toLowerCase()
		.includes('no-cache');
	const mustRevalidate =
		cc['no-cache'] === true ||
		pragmaNoCache ||
		requestCacheMode === 'no-cache';

	const dateMs = (() => {
		const d = storedHeaders.get('date');
		if (d) {
			const v = Date.parse(d);
			if (Number.isFinite(v)) return v;
		}
		return storedAtMs || Date.now();
	})();

	const lifetime = freshnessLifetimeSeconds(storedHeaders, cc, dateMs);
	const age = currentAgeSeconds(storedHeaders, storedAtMs);
	const fresh = !mustRevalidate && lifetime !== null && age < lifetime;

	const immutable =
		cc.immutable === true &&
		requestCacheMode !== 'no-cache' &&
		requestCacheMode !== 'reload';

	return { fresh, immutable, mustRevalidate };
}

/**
 * Build a synthetic key Request keyed on the *upstream* URL.
 *
 * The key URL embeds the upstream request METHOD. Cache Storage only
 * matches `GET` key requests, so without the method in the path a HEAD
 * response (which has an empty body) and a GET response for the same
 * URL collide. The GET navigation then gets served the HEAD entry's
 * empty body and the page renders blank. Namespacing by method keeps
 * the two entries distinct.
 */
export function buildCacheKeyRequest(
	parsedUrl: string,
	rawHeaders: Iterable<[string, string]>,
	method = 'GET'
): Request {
	const native = new Headers();
	for (const [k, v] of rawHeaders) {
		try {
			native.append(k, v);
		} catch {
			// Drop malformed headers (e.g. some Set-Cookie variants).
		}
	}
	const m = (method || 'GET').toUpperCase() === 'HEAD' ? 'HEAD' : 'GET';
	const cacheKeyUrl =
		'https://sj-cache.invalid/' + m + '/' + encodeURIComponent(parsedUrl);
	return new Request(cacheKeyUrl, { method: 'GET', headers: native });
}

/** Rebuild a Headers object from a raw [name, value][] array. */
export function nativeHeadersFromRaw(
	raw: ReadonlyArray<readonly [string, string]>
): Headers {
	const h = new Headers();
	for (const [k, v] of raw) {
		try {
			h.append(k, v);
		} catch {
			// drop malformed
		}
	}
	return h;
}

/** Read the host (lowercased, no port) from a URL string. */
export function hostFromUrl(url: string): string {
	try {
		let h = new URL(url).hostname.trim().toLowerCase();
		if (h.endsWith('.')) h = h.slice(0, -1);
		return h;
	} catch {
		return '';
	}
}
