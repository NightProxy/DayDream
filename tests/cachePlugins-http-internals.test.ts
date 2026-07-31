import { describe, it, expect } from 'vitest';
import {
	DEFAULT_CACHEABLE_STATUSES,
	NULL_BODY_STATUSES,
	buildCacheKeyRequest,
	currentAgeSeconds,
	evaluateFreshness,
	freshnessLifetimeSeconds,
	hostFromUrl,
	isCacheableMethod,
	parseCacheControl,
	responseIsStorable
} from '@apis/cachePlugins/plugins/http-cache-internals';

describe('parseCacheControl', () => {
	it('parses simple directives', () => {
		const cc = parseCacheControl('max-age=300, public');
		expect(cc['max-age']).toBe(300);
		expect(cc.public).toBe(true);
	});
	it('handles immutable + s-maxage', () => {
		const cc = parseCacheControl('immutable, s-maxage=86400');
		expect(cc.immutable).toBe(true);
		expect(cc['s-maxage']).toBe(86400);
	});
	it('parses no-store / no-cache', () => {
		const cc = parseCacheControl('no-store, no-cache');
		expect(cc['no-store']).toBe(true);
		expect(cc['no-cache']).toBe(true);
	});
	it('strips quotes around values', () => {
		const cc = parseCacheControl('max-age="60"');
		expect(cc['max-age']).toBe(60);
	});
	it('returns empty for null', () => {
		expect(parseCacheControl(null)).toEqual({});
	});
	it('rejects negative max-age values', () => {
		const cc = parseCacheControl('max-age=-1');
		expect(cc['max-age']).toBeUndefined();
	});
});

describe('isCacheableMethod', () => {
	it('GET/HEAD only', () => {
		expect(isCacheableMethod('GET')).toBe(true);
		expect(isCacheableMethod('HEAD')).toBe(true);
		expect(isCacheableMethod('POST')).toBe(false);
		expect(isCacheableMethod('PUT')).toBe(false);
		expect(isCacheableMethod('OPTIONS')).toBe(false);
	});
});

describe('responseIsStorable', () => {
	function h(...kv: [string, string][]): Headers {
		const o = new Headers();
		for (const [k, v] of kv) o.set(k, v);
		return o;
	}

	it('rejects non-GET/HEAD', () => {
		expect(responseIsStorable(200, h(), 'POST')).toBe(false);
	});
	it('accepts default cacheable statuses', () => {
		for (const s of DEFAULT_CACHEABLE_STATUSES) {
			expect(responseIsStorable(s, h(), 'GET')).toBe(true);
		}
	});
	it('rejects 206 (partial content)', () => {
		expect(responseIsStorable(206, h(), 'GET')).toBe(false);
	});
	it('rejects 5xx other than 501', () => {
		expect(responseIsStorable(500, h(), 'GET')).toBe(false);
		expect(responseIsStorable(502, h(), 'GET')).toBe(false);
		expect(responseIsStorable(501, h(), 'GET')).toBe(true);
	});
	it('rejects no-store', () => {
		expect(responseIsStorable(200, h(['cache-control', 'no-store']), 'GET'))
			.toBe(false);
	});
	it('rejects Vary: *', () => {
		expect(responseIsStorable(200, h(['vary', '*']), 'GET')).toBe(false);
	});
	it('accepts Vary with named headers', () => {
		expect(
			responseIsStorable(200, h(['vary', 'Accept-Encoding']), 'GET')
		).toBe(true);
	});
});

describe('freshnessLifetimeSeconds', () => {
	it('uses s-maxage first', () => {
		const cc = parseCacheControl('s-maxage=600, max-age=60');
		const lifetime = freshnessLifetimeSeconds(new Headers(), cc, Date.now());
		expect(lifetime).toBe(600);
	});
	it('falls back to max-age', () => {
		const cc = parseCacheControl('max-age=60');
		expect(freshnessLifetimeSeconds(new Headers(), cc, Date.now())).toBe(60);
	});
	it('uses Expires header when no Cache-Control max-age', () => {
		const now = Date.now();
		const headers = new Headers();
		headers.set('expires', new Date(now + 120_000).toUTCString());
		const lifetime = freshnessLifetimeSeconds(headers, {}, now);
		expect(lifetime).toBeGreaterThan(118);
		expect(lifetime).toBeLessThan(122);
	});
	it('uses 10% heuristic with Last-Modified', () => {
		const now = Date.now();
		const headers = new Headers();
		// Last-Modified 1000 seconds ago -> heuristic = 100s.
		headers.set('last-modified', new Date(now - 1_000_000).toUTCString());
		const lifetime = freshnessLifetimeSeconds(headers, {}, now);
		// Allow ±2s for Date.parse rounding.
		expect(lifetime).toBeGreaterThan(98);
		expect(lifetime).toBeLessThan(102);
	});
	it('returns null when no freshness info', () => {
		expect(freshnessLifetimeSeconds(new Headers(), {}, Date.now())).toBe(null);
	});
});

describe('currentAgeSeconds', () => {
	it('uses Age header + resident time', () => {
		const headers = new Headers();
		headers.set('age', '60');
		const age = currentAgeSeconds(headers, Date.now() - 5000);
		expect(age).toBeGreaterThan(64);
		expect(age).toBeLessThan(66);
	});
	it('zero age header still adds resident time', () => {
		const age = currentAgeSeconds(new Headers(), Date.now() - 10_000);
		expect(age).toBeGreaterThan(9);
		expect(age).toBeLessThan(11);
	});
});

describe('evaluateFreshness', () => {
	function freshNow() {
		const h = new Headers();
		h.set('cache-control', 'max-age=300');
		h.set('date', new Date().toUTCString());
		return h;
	}
	function staleHeaders() {
		const h = new Headers();
		h.set('cache-control', 'max-age=10');
		h.set('date', new Date().toUTCString());
		return h;
	}
	it('fresh max-age entry serves', () => {
		const r = evaluateFreshness(freshNow(), Date.now(), 'default');
		expect(r.fresh).toBe(true);
		expect(r.mustRevalidate).toBe(false);
	});
	it('stale entry does not serve', () => {
		const r = evaluateFreshness(staleHeaders(), Date.now() - 60_000, 'default');
		expect(r.fresh).toBe(false);
	});
	it('no-cache forces mustRevalidate', () => {
		const h = freshNow();
		h.set('cache-control', 'max-age=300, no-cache');
		const r = evaluateFreshness(h, Date.now(), 'default');
		expect(r.mustRevalidate).toBe(true);
		expect(r.fresh).toBe(false);
	});
	it('immutable bypasses freshness when client did not force refresh', () => {
		const h = staleHeaders();
		h.set('cache-control', 'max-age=10, immutable');
		const r = evaluateFreshness(h, Date.now() - 60_000, 'default');
		expect(r.immutable).toBe(true);
	});
	it('immutable does NOT apply when request asks no-cache', () => {
		const h = staleHeaders();
		h.set('cache-control', 'max-age=10, immutable');
		const r = evaluateFreshness(h, Date.now() - 60_000, 'no-cache');
		expect(r.immutable).toBe(false);
	});
});

describe('buildCacheKeyRequest', () => {
	it('encodes URL into the key path', () => {
		const req = buildCacheKeyRequest('https://example.com/foo?bar=1', []);
		expect(req.url).toContain('sj-cache.invalid');
		expect(req.url).toContain('https%3A%2F%2Fexample.com%2Ffoo%3Fbar%3D1');
	});
	it('attaches headers on the synthetic Request', () => {
		const req = buildCacheKeyRequest('https://x.com/', [
			['accept', 'text/html'],
			['accept-encoding', 'gzip']
		]);
		expect(req.headers.get('accept')).toBe('text/html');
		expect(req.headers.get('accept-encoding')).toBe('gzip');
	});
});

describe('hostFromUrl', () => {
	it('returns lowercase hostname', () => {
		expect(hostFromUrl('https://EXAMPLE.com:443/foo')).toBe('example.com');
	});
	it('returns empty string on garbage', () => {
		expect(hostFromUrl('not a url')).toBe('');
	});
});

describe('NULL_BODY_STATUSES', () => {
	it('includes the spec-mandated set', () => {
		expect(NULL_BODY_STATUSES.has(204)).toBe(true);
		expect(NULL_BODY_STATUSES.has(304)).toBe(true);
		expect(NULL_BODY_STATUSES.has(200)).toBe(false);
	});
});
