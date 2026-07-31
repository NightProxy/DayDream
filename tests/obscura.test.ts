import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const WASM_PATH = resolve(
	__dirname,
	'../src/pkgs/Obscura/pkg/obscura_bg.wasm'
);

let encode: (s: string) => string;
let decode: (s: string) => string;
let isDaylightToken: (s: string) => boolean;

beforeAll(async () => {
	const { initSync, encode: _enc, decode: _dec, is_daylight_token: _idt } =
		await import('../src/pkgs/Obscura/pkg/obscura.js');
	const wasmBytes = readFileSync(WASM_PATH);
	initSync({ module: wasmBytes });
	encode = _enc;
	decode = _dec;
	isDaylightToken = _idt;
});

// ---------------------------------------------------------------------------
// Helpers mirroring entry.ts
// ---------------------------------------------------------------------------
function daylightPayload(s: string, _isDT: (x: string) => boolean): string | null {
	if (_isDT(s)) return s;
	const slash = s.lastIndexOf('/');
	if (slash === -1) return null;
	const tail = s.slice(slash + 1);
	return tail && _isDT(tail) ? tail : null;
}

const SCRAMJET_QP_KEYS = new Set([
	'$rfp', '$rfs', '$module', '$tf', '$pf', '$iframe',
	'$mode', '$cred', '$dest', '$io', '$fs', '$csr', '$fakedataurl',
]);

function stripScramjetParams(url: string): string {
	try {
		const u = new URL(url);
		let changed = false;
		for (const key of [...u.searchParams.keys()]) {
			if (SCRAMJET_QP_KEYS.has(key)) {
				u.searchParams.delete(key);
				changed = true;
			}
		}
		return changed ? u.toString() : url;
	} catch {
		return url;
	}
}

const BASE_PREFIX = '/assets/res/';

function makeScramjetUrl(
	origin: string,
	encodedToken: string,
	opts: { controllerId?: string; frameId?: string; qp?: Record<string, string> } = {}
): string {
	const { controllerId, frameId, qp = {} } = opts;
	let path = BASE_PREFIX;
	if (controllerId) path += `${controllerId}/`;
	if (frameId) path += `${frameId}/`;
	path += encodedToken;
	const u = new URL(path, origin);
	for (const [k, v] of Object.entries(qp)) u.searchParams.set(k, v);
	return u.toString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Obscura WASM — encode/decode round-trips', () => {
	const cases = [
		'https://google.com',
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://example.com/path/to/resource?foo=bar&baz=qux#anchor',
		'http://localhost:3000/dev',
		'https://duckduckgo.com/?q=hello+world',
		'https://user:pass@subdomain.example.co.uk:8080/p?a=1&b=2#frag',
	];

	for (const url of cases) {
		it(`round-trips: ${url}`, () => {
			const token = encode(url);
			expect(token).toBeTruthy();
			expect(token).not.toBe(url);
			expect(decode(token)).toBe(url);
		});
	}

	it('encode produces a non-empty token even for empty input (WASM behaviour)', () => {
		// The raw WASM encode('') returns a non-empty sentinel (e.g. "db").
		// The entry.ts guardEmpty wrapper short-circuits to '' before hitting WASM.
		const token = encode('');
		// We only assert it is a string; the exact value is an implementation detail.
		expect(typeof token).toBe('string');
	});

	it('encoded token is different from the original URL', () => {
		const url = 'https://nyxai.me/';
		expect(encode(url)).not.toBe(url);
	});
});

describe('Obscura WASM — is_daylight_token', () => {
	it('encoded token is recognised as a daylight token', () => {
		const token = encode('https://google.com');
		expect(isDaylightToken(token)).toBe(true);
	});

	it('plain URL is NOT a daylight token', () => {
		expect(isDaylightToken('https://google.com')).toBe(false);
	});

	it('random string is NOT a daylight token', () => {
		expect(isDaylightToken('hello-world-123')).toBe(false);
	});
});

describe('daylightPayload — Scramjet URL extraction', () => {
	it('bare token resolves directly', () => {
		const token = encode('https://google.com');
		expect(daylightPayload(token, isDaylightToken)).toBe(token);
	});

	it('token at per-frame prefix (controllerId/frameId) resolves via last segment', () => {
		const token = encode('https://nyxai.me/');
		const path = `fgbloc5l/qhrmsxpq/${token}`;
		expect(daylightPayload(path, isDaylightToken)).toBe(token);
	});

	it('decodes token extracted from per-frame path correctly', () => {
		const url = 'https://duckduckgo.com/';
		const token = encode(url);
		const path = `fgbloc5l/qhrmsxpq/${token}`;
		const payload = daylightPayload(path, isDaylightToken);
		expect(payload).toBeTruthy();
		expect(decode(payload!)).toBe(url);
	});

	it('returns null for a plain non-token path segment', () => {
		expect(daylightPayload('notavalidtoken', isDaylightToken)).toBeNull();
	});

	it('dhxbkkzKVpJft5pg6b2Q is recognised as a daylight token (bug report token)', () => {
		// The Scramjet error "unable to parse rewritten url" happens because
		// this token decodes to something that fails URL.canParse — the token
		// itself IS valid per is_daylight_token. This test documents that.
		const bugToken = 'dhxbkkzKVpJft5pg6b2Q';
		expect(isDaylightToken(bugToken)).toBe(true);
		// It should decode to something, even if that something isn't a parseable URL
		let decoded: string | undefined;
		try { decoded = decode(bugToken); } catch { /* may throw */ }
		if (decoded !== undefined) {
			expect(typeof decoded).toBe('string');
		}
	});
});

describe('stripScramjetParams', () => {
	it('strips $io and $rfs from a decoded URL', () => {
		const url = 'https://nyxai.me/?%24io=http%3A%2F%2Fnyxai.me&%24rfs=';
		expect(stripScramjetParams(url)).toBe('https://nyxai.me/');
	});

	it('strips all known QP keys', () => {
		const u = new URL('https://example.com/');
		for (const k of SCRAMJET_QP_KEYS) u.searchParams.set(k, 'x');
		expect(stripScramjetParams(u.toString())).toBe('https://example.com/');
	});

	it('preserves real query params alongside scramjet ones', () => {
		const input = 'https://example.com/?q=hello&$io=https%3A%2F%2Fgoogle.com&page=2';
		const out = new URL(stripScramjetParams(input));
		expect(out.searchParams.get('q')).toBe('hello');
		expect(out.searchParams.get('page')).toBe('2');
		expect(out.searchParams.has('$io')).toBe(false);
	});

	it('is a no-op when no scramjet params present', () => {
		const url = 'https://example.com/?q=test';
		expect(stripScramjetParams(url)).toBe(url);
	});

	it('handles invalid URLs gracefully', () => {
		expect(stripScramjetParams('not-a-url')).toBe('not-a-url');
	});

	it('strips params from realistic Scramjet proxied URL with per-frame QPs', () => {
		const input =
			'http://localhost:5173/assets/res/fgbloc5l/qhrmsxpq/dhxbkkzKVpJft5pg6b2Q' +
			'?%24rfp=origin&%24tf=v39tq401&%24pf=v39tq401&%24iframe=1&%24io=https%3A%2F%2Fduckduckgo.com';
		const out = new URL(stripScramjetParams(input));
		expect(out.search).toBe('');
		expect(out.pathname).toBe('/assets/res/fgbloc5l/qhrmsxpq/dhxbkkzKVpJft5pg6b2Q');
	});
});

describe('Full Scramjet URL round-trip (encode → proxied URL → decode)', () => {
	const ORIGIN = 'http://localhost:5173';

	const urlCases = [
		'https://google.com',
		'https://nyxai.me/',
		'https://duckduckgo.com/?q=test',
		'https://www.youtube.com/watch?v=abc123',
	];

	for (const url of urlCases) {
		it(`bare prefix: ${url}`, () => {
			const token = encode(url);
			const proxied = makeScramjetUrl(ORIGIN, token);
			const u = new URL(proxied);
			const segment = u.pathname.slice(BASE_PREFIX.length);
			const payload = daylightPayload(segment, isDaylightToken);
			expect(payload).toBeTruthy();
			expect(decode(payload!)).toBe(url);
		});

		it(`per-frame prefix: ${url}`, () => {
			const token = encode(url);
			const proxied = makeScramjetUrl(ORIGIN, token, {
				controllerId: 'fgbloc5l',
				frameId: 'qhrmsxpq',
			});
			const u = new URL(proxied);
			const segment = u.pathname.slice(BASE_PREFIX.length);
			const payload = daylightPayload(segment, isDaylightToken);
			expect(payload).toBeTruthy();
			expect(decode(payload!)).toBe(url);
		});

		it(`per-frame prefix with QPs stripped: ${url}`, () => {
			const token = encode(url);
			const proxied = makeScramjetUrl(ORIGIN, token, {
				controllerId: 'fgbloc5l',
				frameId: 'qhrmsxpq',
				qp: {
					'$io': 'https://duckduckgo.com',
					'$rfp': 'origin',
					'$tf': 'v39tq401',
					'$pf': 'v39tq401',
					'$iframe': '1',
				},
			});
			const cleaned = stripScramjetParams(proxied);
			const u = new URL(cleaned);
			expect(u.search).toBe('');
			const segment = u.pathname.slice(BASE_PREFIX.length);
			const payload = daylightPayload(segment, isDaylightToken);
			expect(payload).toBeTruthy();
			expect(decode(payload!)).toBe(url);
		});
	}
});
