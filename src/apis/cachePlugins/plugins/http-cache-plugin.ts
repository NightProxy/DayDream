/**
 * HttpCachePlugin — per-frame Scramjet plugin that caches GET/HEAD
 * responses in browser CacheStorage (`caches.open(name)`) with
 * RFC-9111-ish freshness.
 *
 * Storage model
 * -------------
 * Each policy declares its own `cacheName`. We open one
 * `Cache` per policy via `caches.open(policy.cacheName)`, memoized
 * per plugin instance. Multiple policies → multiple buckets, which
 * keeps per-host eviction surgical and matches how the rest of the
 * web platform expects Cache Storage to be partitioned.
 *
 * Cache key
 * ---------
 * `buildCacheKeyRequest(url, headers)` constructs a synthetic
 * `https://sj-cache.invalid/<encoded-url>` Request that carries the
 * caller's headers verbatim, so `cache.match` honors `Vary` natively
 * (Cache Storage walks stored Vary values for free).
 *
 * Tag headers
 * -----------
 * Stored responses carry three bookkeeping headers added at `put` time
 * and stripped at `match` time:
 *   - `x-sj-cached-at`   — ms since epoch (used for freshness Age calc)
 *   - `x-sj-cached-host` — normalized hostname (used for per-host bust)
 *   - `x-sj-cached-url`  — original upstream URL (used for listings)
 *
 * Lookup result is always returned with these stripped so they don't
 * leak into pages.
 *
 * Freshness
 * ---------
 * Pure RFC-9111-ish logic lives in `./http-cache-internals.ts` and is
 * shared with the vendored utils plugin's port. Stale entries fall
 * through to the network; `immutable` short-circuits freshness unless
 * the client explicitly opted into a refresh (`req.cache === 'reload'`
 * or `'no-cache'`).
 *
 * Runtime symbol resolution
 * -------------------------
 * `ManagedPlugin` and `BareResponse` are read off `$scramjetController`
 * / `$scramjet` globals (the IIFE bundles loaded via
 * `<script src="assets/api.js">`), NOT from the tsconfig alias
 * `@mercuryworkshop/scramjet-controller`. The alias resolves to the
 * vendored controller SOURCE which is built independently into
 * `dist/api.js` — pulling it into the main app graph forces
 * Vite/rolldown to compile the controller's `?text` and other
 * build-time imports inside the app, which doesn't work. Same lazy
 * pattern that `src/apis/eventsBridge.ts` uses for `$scramjet.Plugin`.
 */

// @ts-nocheck — bridges to scramjet's untyped runtime.

import { compileHostPattern, normalizeHost } from '../host-match';
import type { CachePolicy } from '../registry';
import {
	NULL_BODY_STATUSES,
	STORED_AT_HEADER,
	buildCacheKeyRequest,
	evaluateFreshness,
	nativeHeadersFromRaw,
	responseIsStorable
} from './http-cache-internals';

export interface HttpCachePluginOptions {
	/**
	 * Resolve the policy for a given URL. Return null to skip caching
	 * for that URL. Return a disabled policy to also skip (negative rule).
	 */
	policyResolver: (url: string) => CachePolicy | null;
	/** Global gate. Plugin no-ops when this returns false. */
	isEnabled: () => boolean;
}

// ---------- aggregate-stats / management types ----------

/** Filter-by-host listing key. */
export interface CacheKey {
	url: string;
	host: string;
	storedAt: number;
	bytes: number;
}

/** Aggregate stats for one cacheName. */
export interface CacheBackendStats {
	totalEntries: number;
	totalBytes: number;
	byHost: Record<
		string,
		{ entries: number; bytes: number; lastStoredAt: number }
	>;
}

/**
 * Stable per-entry metadata. Exposed as a type for backwards-compat
 * with anything that imported it from the old `backends/types`. Kept
 * minimal — the live stored representation is just the response's
 * headers + tag headers.
 */
export interface CacheMeta {
	url: string;
	host: string;
	status: number;
	statusText: string;
	vary?: string;
	storedAt: number;
	headers: ReadonlyArray<readonly [string, string]>;
}

// ---------- bookkeeping headers ----------

const STORED_HOST_HEADER = 'x-sj-cached-host';
const STORED_URL_HEADER = 'x-sj-cached-url';

/**
 * Prefix for origin-scoped cache buckets. Bumped to v2 when buckets
 * moved from policy-scoped to origin-scoped — v1 entries are keyed
 * differently and are simply abandoned (and reclaimed by `bustAll`).
 */
export const ORIGIN_CACHE_PREFIX = 'ddx-cache-v2:';
const TAG_HEADERS: ReadonlySet<string> = new Set([
	STORED_AT_HEADER,
	STORED_HOST_HEADER,
	STORED_URL_HEADER
]);

// ---------- runtime symbol resolution ----------

type ManagedPluginCtor = new (
	name: string,
	deps: string[]
) => ManagedPluginInstance;

interface ManagedPluginInstance {
	install(frame: unknown): void;
	tap(hook: unknown, cb: (...args: unknown[]) => unknown): void;
}

interface BareResponseStatic {
	fromNativeResponse(r: Response): unknown;
}

function getManagedPlugin(): ManagedPluginCtor | null {
	const ctl = (
		globalThis as { $scramjetController?: { ManagedPlugin?: unknown } }
	).$scramjetController;
	const mp = ctl?.ManagedPlugin;
	if (typeof mp !== 'function') return null;
	return mp as ManagedPluginCtor;
}

function getBareResponse(): BareResponseStatic | null {
	const sj = (globalThis as { $scramjet?: { BareResponse?: unknown } })
		.$scramjet;
	const br = sj?.BareResponse;
	if (
		!br ||
		typeof (br as { fromNativeResponse?: unknown }).fromNativeResponse !==
			'function'
	) {
		return null;
	}
	return br as BareResponseStatic;
}

// ---------- helpers ----------

function isCacheableMethod(method: string): boolean {
	return method === 'GET' || method === 'HEAD';
}

/** Read the host (lowercased, no port) from a URL string. */
function hostFromUrl(url: string): string {
	try {
		let h = new URL(url).hostname.trim().toLowerCase();
		if (h.endsWith('.')) h = h.slice(0, -1);
		return h;
	} catch {
		return '';
	}
}

/** Read the origin (scheme + host + port) from a URL string. */
function originFromUrl(url: string): string {
	try {
		return new URL(url).origin.toLowerCase();
	} catch {
		return '';
	}
}

interface BareResponseLike {
	status: number;
	statusText: string;
	rawHeaders: ReadonlyArray<readonly [string, string]>;
	arrayBuffer(): Promise<ArrayBuffer>;
}

interface ScramjetHeadersLike {
	toRawHeaders(): [string, string][];
}

interface ScramjetRequestLike {
	method: string;
	cache: string;
	initialHeaders: ScramjetHeadersLike;
}

interface ScramjetFetchCtxLike {
	request: ScramjetRequestLike;
	parsed: { url: URL };
}

interface ScramjetRequestHook {
	earlyResponse?: unknown;
}

interface ScramjetPreresponseHook {
	response: BareResponseLike;
}

interface FrameLike {
	fetchHandler: {
		hooks: {
			fetch: {
				request: unknown;
				preresponse: unknown;
			};
		};
	};
}

/**
 * Drain a BareResponse's body into a fresh BareResponse with a buffered
 * body, so the rest of the pipeline can re-read it after we've consumed
 * the original stream for caching.
 */
async function rebuildBareResponseWithBuffer(
	bare: BareResponseLike
): Promise<{ replacement: unknown; bodyBuffer: ArrayBuffer | null }> {
	const BareResponse = getBareResponse();
	if (!BareResponse) {
		return { replacement: bare, bodyBuffer: null };
	}

	const status = bare.status;
	const isNullBody = NULL_BODY_STATUSES.has(status);
	const headers = nativeHeadersFromRaw(bare.rawHeaders);

	if (isNullBody) {
		return {
			replacement: BareResponse.fromNativeResponse(
				new Response(null, {
					status,
					statusText: bare.statusText,
					headers
				})
			),
			bodyBuffer: null
		};
	}

	const buf = await bare.arrayBuffer();
	return {
		replacement: BareResponse.fromNativeResponse(
			new Response(buf, {
				status,
				statusText: bare.statusText,
				headers
			})
		),
		bodyBuffer: buf
	};
}

function toIterable(
	headers: ScramjetHeadersLike
): Iterable<[string, string]> {
	try {
		return headers.toRawHeaders();
	} catch {
		return [];
	}
}

/**
 * Build a stripped copy of stored headers (tag headers removed). Used
 * when handing a cached response back to the page.
 */
function strippedHeadersFromStored(stored: Response): Headers {
	const out = new Headers();
	for (const [k, v] of stored.headers.entries()) {
		if (TAG_HEADERS.has(k.toLowerCase())) continue;
		try {
			out.append(k, v);
		} catch {
			// drop malformed
		}
	}
	return out;
}

/**
 * Build the tagged Response that will be stored. Adds the bookkeeping
 * headers needed for freshness, per-host bust, and listings.
 */
function buildStorableResponse(
	bodyBuffer: ArrayBuffer | null,
	status: number,
	statusText: string,
	rawHeaders: ReadonlyArray<readonly [string, string]>,
	host: string,
	url: string,
	storedAt: number
): Response {
	const native = nativeHeadersFromRaw(rawHeaders);
	native.set(STORED_AT_HEADER, String(storedAt));
	native.set(STORED_HOST_HEADER, host);
	native.set(STORED_URL_HEADER, url);
	const isNullBody = NULL_BODY_STATUSES.has(status);
	return new Response(isNullBody ? null : bodyBuffer, {
		status,
		statusText,
		headers: native
	});
}

// ---------- the plugin ----------

/**
 * Construct an instance of the HTTP cache plugin. Returns null if
 * `$scramjetController.ManagedPlugin` isn't loaded yet (caller should
 * have awaited the controller's `wait()` before reaching here).
 */
export function createHttpCachePlugin(
	options: HttpCachePluginOptions
): unknown {
	const ManagedPlugin = getManagedPlugin();
	if (!ManagedPlugin) {
		console.warn(
			'[http-cache] $scramjetController.ManagedPlugin not loaded; plugin not created'
		);
		return null;
	}

	const cameFromCache = new WeakMap<ScramjetRequestLike, true>();

	// Origin -> bucket name, memoized so the digest is computed once
	// per origin rather than on every request.
	const bucketNameByOrigin = new Map<string, string>();

	async function originBucketName(origin: string): Promise<string> {
		const cached = bucketNameByOrigin.get(origin);
		if (cached) return cached;
		let digest: string;
		try {
			const bytes = new TextEncoder().encode(origin);
			const hash = await crypto.subtle.digest('SHA-256', bytes);
			digest = Array.from(new Uint8Array(hash))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
				.slice(0, 56);
		} catch {
			digest = encodeURIComponent(origin);
		}
		const name = `${ORIGIN_CACHE_PREFIX}${digest}`;
		bucketNameByOrigin.set(origin, name);
		return name;
	}

	/**
	 * Resolve the cache bucket for a URL.
	 *
	 * Buckets are ORIGIN-scoped, not policy-scoped: two origins never
	 * share a bucket, so "clear site data" for one origin can delete a
	 * whole bucket without touching anyone else's entries. Policies
	 * still decide WHETHER to cache (a missing or disabled policy skips
	 * caching) — they just no longer decide WHERE.
	 */
	async function resolveBucket(url: string): Promise<string | null> {
		if (!options.isEnabled()) return null;
		const policy = options.policyResolver(url);
		if (!policy) return null;
		if (!policy.enabled) return null;
		const origin = originFromUrl(url);
		if (!origin) return null;
		return originBucketName(origin);
	}

	class HttpCachePluginImpl extends (ManagedPlugin as ManagedPluginCtor) {
		// One open Cache promise per cacheName, memoized for the plugin
		// instance's lifetime. Cache Storage's caches.open is cheap but
		// not free, and we hit it on every request.
		private readonly cachePromises = new Map<string, Promise<Cache>>();

		constructor() {
			super('ddx-http-cache', []);
		}

		private openCache(cacheName: string): Promise<Cache> {
			let p = this.cachePromises.get(cacheName);
			if (!p) {
				p = caches.open(cacheName);
				this.cachePromises.set(cacheName, p);
			}
			return p;
		}

		install(frame: unknown): void {
			super.install(frame);
			const f = frame as FrameLike;
			const hooks = f.fetchHandler?.hooks?.fetch;
			if (!hooks) {
				console.warn(
					'[http-cache] frame has no fetch hooks; install skipped'
				);
				return;
			}

			// ----- request: cache lookup --------------------------------------
			this.tap(hooks.request, async (...args: unknown[]) => {
				const ctx = args[0] as ScramjetFetchCtxLike;
				const props = args[1] as ScramjetRequestHook;
				const req = ctx.request;
				if (!isCacheableMethod(req.method)) return;
				const reqCache = req.cache;
				// Honor the request's explicit bypass modes — these are
				// the only gates we keep before consulting policy.
				if (reqCache === 'no-store' || reqCache === 'reload') return;
				if (props.earlyResponse) return;

				const url = ctx.parsed.url.href;
				const cacheName = await resolveBucket(url);
				if (!cacheName) return;

				const cache = await this.openCache(cacheName);
				const stored = await cache.match(
					buildCacheKeyRequest(
						url,
						toIterable(req.initialHeaders),
						req.method
					)
				);
				if (!stored) {
					try {
						console.log(
							`[ddx-cache] MISS ${req.method} ${url} (bucket=${cacheName})`
						);
					} catch {}
					return;
				}

				const storedAt = parseInt(
					stored.headers.get(STORED_AT_HEADER) ?? '0',
					10
				);
				const { fresh, immutable } = evaluateFreshness(
					stored.headers,
					storedAt,
					reqCache
				);

				if (!fresh && !immutable) {
					try {
						console.log(
							`[ddx-cache] STALE ${req.method} ${url} (bucket=${cacheName})`
						);
					} catch {}
					return;
				}

				const headers = strippedHeadersFromStored(stored);
				if (storedAt) {
					headers.set(
						'age',
						String(Math.floor((Date.now() - storedAt) / 1000))
					);
				}

				const isNullBody = NULL_BODY_STATUSES.has(stored.status);
				const earlyBody = isNullBody ? null : await stored.arrayBuffer();

				const BareResponse = getBareResponse();
				if (!BareResponse) return;
				const earlyResponse = BareResponse.fromNativeResponse(
					new Response(earlyBody, {
						status: stored.status,
						statusText: stored.statusText,
						headers
					})
				);

				cameFromCache.set(req, true);
				props.earlyResponse = earlyResponse;
				try {
					console.log(
						`[ddx-cache] HIT  ${req.method} ${url} (bucket=${cacheName})`
					);
				} catch {}
			});

			// ----- preresponse: cache store -----------------------------------
			this.tap(hooks.preresponse, async (...args: unknown[]) => {
				const ctx = args[0] as ScramjetFetchCtxLike;
				const props = args[1] as ScramjetPreresponseHook;
				const req = ctx.request;

				// Don't re-cache something we just served from cache.
				if (cameFromCache.has(req)) {
					cameFromCache.delete(req);
					return;
				}

				if (req.cache === 'no-store') return;
				if (!isCacheableMethod(req.method)) return;

				const headers = nativeHeadersFromRaw(props.response.rawHeaders);
				if (
					!responseIsStorable(props.response.status, headers, req.method)
				) {
					try {
						console.log(
							`[ddx-cache] SKIP ${req.method} ${ctx.parsed.url.href} status=${props.response.status} (not storable)`
						);
					} catch {}
					return;
				}

				const url = ctx.parsed.url.href;
				const cacheName = await resolveBucket(url);
				if (!cacheName) return;

				// Drain the body once and rebuild so the rest of the
				// pipeline can still re-read it.
				const { replacement, bodyBuffer } =
					await rebuildBareResponseWithBuffer(props.response);
				props.response = replacement as BareResponseLike;
				const newResp = props.response;

				const host = normalizeHost(hostFromUrl(url));
				const storedAt = Date.now();
				const toStore = buildStorableResponse(
					bodyBuffer,
					newResp.status,
					newResp.statusText,
					newResp.rawHeaders,
					host,
					url,
					storedAt
				);

				const cacheKey = buildCacheKeyRequest(
					url,
					toIterable(req.initialHeaders),
					req.method
				);

				try {
					const cache = await this.openCache(cacheName);
					await cache.put(cacheKey, toStore);
					try {
						const bytes = bodyBuffer?.byteLength ?? 0;
						console.log(
							`[ddx-cache] PUT  ${req.method} ${url} status=${newResp.status} bytes=${bytes} (bucket=${cacheName})`
						);
					} catch {}
				} catch (err) {
					console.warn('[http-cache] cache.put failed:', err);
				}
			});
		}
	}

	return new HttpCachePluginImpl();
}

// ---------- aggregate operations (used by the manager) ----------

/**
 * Enumerate entries in a single cacheName bucket, optionally filtered
 * by normalized host.
 *
 * Cost: O(n) cache.keys + per-entry cache.match. Cache Storage doesn't
 * expose metadata without rehydrating the Response — this is the same
 * cost the old CacheStorageBackend paid.
 */
export async function listKeys(
	cacheName: string,
	filter?: { host?: string; limit?: number }
): Promise<CacheKey[]> {
	try {
		const cache = await caches.open(cacheName);
		const reqs = await cache.keys();
		const out: CacheKey[] = [];
		const hostFilter = filter?.host ? normalizeHost(filter.host) : undefined;
		const limit = filter?.limit ?? Number.POSITIVE_INFINITY;
		for (const req of reqs) {
			if (out.length >= limit) break;
			const resp = await cache.match(req);
			if (!resp) continue;
			const host =
				resp.headers.get(STORED_HOST_HEADER) ||
				hostFromUrl(resp.headers.get(STORED_URL_HEADER) ?? '');
			if (hostFilter && host !== hostFilter) continue;
			const url = resp.headers.get(STORED_URL_HEADER) ?? req.url;
			const storedAt = parseInt(
				resp.headers.get(STORED_AT_HEADER) ?? '0',
				10
			);
			// Approximate size: Content-Length if present, else 0.
			const cl = parseInt(resp.headers.get('content-length') ?? '0', 10);
			out.push({
				url,
				host,
				storedAt: Number.isFinite(storedAt) ? storedAt : 0,
				bytes: Number.isFinite(cl) ? cl : 0
			});
		}
		return out;
	} catch (err) {
		console.warn('[http-cache] listKeys failed:', err);
		return [];
	}
}

/** Aggregate stats for one cacheName bucket. */
export async function statsFor(
	cacheName: string
): Promise<CacheBackendStats> {
	const keys = await listKeys(cacheName);
	const out: CacheBackendStats = {
		totalEntries: keys.length,
		totalBytes: 0,
		byHost: {}
	};
	for (const k of keys) {
		out.totalBytes += k.bytes;
		const slot = out.byHost[k.host] ?? {
			entries: 0,
			bytes: 0,
			lastStoredAt: 0
		};
		slot.entries += 1;
		slot.bytes += k.bytes;
		if (k.storedAt > slot.lastStoredAt) slot.lastStoredAt = k.storedAt;
		out.byHost[k.host] = slot;
	}
	return out;
}

/**
 * Drop every entry whose stored host matches `pattern` from a single
 * cacheName bucket. Returns the number of evicted entries.
 *
 * `pattern` accepts the same wildcards as `CachePolicy.hostPatterns`:
 * `*.github.com`, `chase.com`, `*`.
 */
export async function bustForHost(
	pattern: string,
	cacheName: string
): Promise<number> {
	const p = pattern.trim();
	if (!p) return 0;
	const test = compileHostPattern(p);
	try {
		const cache = await caches.open(cacheName);
		const reqs = await cache.keys();
		let removed = 0;
		for (const req of reqs) {
			const resp = await cache.match(req);
			if (!resp) continue;
			const h =
				resp.headers.get(STORED_HOST_HEADER) ||
				hostFromUrl(resp.headers.get(STORED_URL_HEADER) ?? '');
			if (!test(h)) continue;
			if (await cache.delete(req)) removed += 1;
		}
		return removed;
	} catch (err) {
		console.warn('[http-cache] bustForHost failed:', err);
		return 0;
	}
}

/** Drop the entire cache bucket. */
export async function bustAll(cacheName: string): Promise<void> {
	try {
		await caches.delete(cacheName);
	} catch (err) {
		console.warn('[http-cache] bustAll failed:', err);
	}
}
