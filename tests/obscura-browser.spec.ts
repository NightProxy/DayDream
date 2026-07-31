/**
 * Full browser Playwright test for Obscura WASM + Scramjet URL handling.
 *
 * The WASM is injected directly into a blank page as base64 so tests are
 * independent of the app boot sequence.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
import { resolve } from 'node:path';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const WASM_PATH = resolve(
	__dirname,
	'../src/pkgs/Obscura/pkg/obscura_bg.wasm'
);
const JS_PATH = resolve(
	__dirname,
	'../src/pkgs/Obscura/pkg/obscura.js'
);

const wasmBase64 = readFileSync(WASM_PATH).toString('base64');
const obscuraJs = readFileSync(JS_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Bootstrap: load WASM into page via base64 + obscura.js evaluated inline
// ---------------------------------------------------------------------------
async function bootObscura(page: Page) {
	await page.goto('about:blank');

	// Evaluate obscura.js as an IIFE to get the exports, then initSync
	await page.evaluate(
		({ js, b64 }: { js: string; b64: string }) => {
			// Build a module-like object via indirect eval
			const module: Record<string, unknown> = {};
			const exports: Record<string, unknown> = {};
			// obscura.js uses ES module syntax — we need to strip it and wrap
			// Pull out each export manually using a simple text transform
			const wrapped = js
				.replace(/^export function /gm, 'module.__fn = function ')
				.replace(/^export \{ /gm, '// export { ');

			// Instead, use dynamic import via blob URL (works in Chromium)
			const blob = new Blob([js], { type: 'application/javascript' });
			const blobUrl = URL.createObjectURL(blob);
			(window as any).__obscuraBlobUrl = blobUrl;
			(window as any).__obscuraB64 = b64;
		},
		{ js: obscuraJs, b64: wasmBase64 }
	);

	// Import via blob URL (ES module dynamic import works in Chromium)
	await page.evaluate(async () => {
		const blobUrl: string = (window as any).__obscuraBlobUrl;
		const b64: string = (window as any).__obscuraB64;

		function b64ToBytes(s: string): Uint8Array {
			const bin = atob(s);
			const out = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
			return out;
		}

		const mod = await import(/* @vite-ignore */ blobUrl);
		mod.initSync({ module: b64ToBytes(b64) });

		(window as any).__obscura = {
			ready: true,
			encode: (s: string) => s ? mod.encode(s) : s,
			decode: (s: string) => s ? mod.decode(s) : s,
			isDaylightToken: (s: string) => mod.is_daylight_token(s),
		};
	});

	const ready = await page.evaluate(() => (window as any).__obscura?.ready === true);
	if (!ready) throw new Error('__obscura failed to initialise');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function encode(page: Page, url: string): Promise<string> {
	return page.evaluate((u) => (window as any).__obscura.encode(u), url);
}

async function decode(page: Page, token: string): Promise<string> {
	return page.evaluate((t) => (window as any).__obscura.decode(t), token);
}

async function isDaylightToken(page: Page, s: string): Promise<boolean> {
	return page.evaluate((t) => (window as any).__obscura.isDaylightToken(t), s);
}

const SCRAMJET_QP_KEYS = [
	'$rfp', '$rfs', '$module', '$tf', '$pf', '$iframe',
	'$mode', '$cred', '$dest', '$io', '$fs', '$csr', '$fakedataurl',
];

async function stripScramjetParams(page: Page, url: string): Promise<string> {
	return page.evaluate(({ url, keys }: { url: string; keys: string[] }) => {
		try {
			const keySet = new Set(keys);
			const u = new URL(url);
			let changed = false;
			for (const key of [...u.searchParams.keys()]) {
				if (keySet.has(key)) { u.searchParams.delete(key); changed = true; }
			}
			return changed ? u.toString() : url;
		} catch { return url; }
	}, { url, keys: SCRAMJET_QP_KEYS });
}

const BASE_PREFIX = '/assets/res/';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Obscura WASM in browser', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await bootObscura(page);
	});

	test.afterAll(async () => {
		await page?.close();
	});

	// --- encode/decode round-trips ---
	const roundTripCases = [
		'https://google.com',
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://example.com/path?foo=bar&baz=qux#anchor',
		'http://localhost:3000/dev',
		'https://duckduckgo.com/?q=hello+world',
		'https://nyxai.me/',
		'https://user:pass@sub.example.co.uk:8080/p?a=1#f',
	];

	for (const url of roundTripCases) {
		test(`round-trip: ${url}`, async () => {
			const token = await encode(page, url);
			expect(token).toBeTruthy();
			expect(token).not.toBe(url);
			expect(await decode(page, token)).toBe(url);
		});
	}

	test('encode produces non-empty output for non-empty input', async () => {
		const token = await encode(page, 'https://google.com');
		expect(token.length).toBeGreaterThan(0);
	});

	test('encoded token differs from original URL', async () => {
		expect(await encode(page, 'https://nyxai.me/')).not.toBe('https://nyxai.me/');
	});

	// --- is_daylight_token ---
	test('encoded token is a daylight token', async () => {
		const token = await encode(page, 'https://google.com');
		expect(await isDaylightToken(page, token)).toBe(true);
	});

	test('plain URL is not a daylight token', async () => {
		expect(await isDaylightToken(page, 'https://google.com')).toBe(false);
	});

	test('random string is not a daylight token', async () => {
		expect(await isDaylightToken(page, 'hello-world-123')).toBe(false);
	});

	test('bug-report token dhxbkkzKVpJft5pg6b2Q is a daylight token', async () => {
		// Documents that the Scramjet error is decode-time, not token-detection
		expect(await isDaylightToken(page, 'dhxbkkzKVpJft5pg6b2Q')).toBe(true);
	});

	// --- Scramjet URL patterns ---
	const proxyUrls = [
		'https://google.com',
		'https://nyxai.me/',
		'https://duckduckgo.com/?q=test',
		'https://www.youtube.com/watch?v=abc123',
	];

	for (const url of proxyUrls) {
		test(`bare prefix round-trip: ${url}`, async () => {
			const token = await encode(page, url);
			const segment = `${BASE_PREFIX}${token}`.split('/').at(-1)!;
			expect(await decode(page, segment)).toBe(url);
		});

		test(`per-frame prefix round-trip: ${url}`, async () => {
			const token = await encode(page, url);
			const segment = `${BASE_PREFIX}fgbloc5l/qhrmsxpq/${token}`.split('/').at(-1)!;
			expect(await decode(page, segment)).toBe(url);
		});

		test(`per-frame prefix + QPs stripped: ${url}`, async () => {
			const token = await encode(page, url);
			const proxied = new URL(
				`${BASE_PREFIX}fgbloc5l/qhrmsxpq/${token}`,
				'http://localhost:5173'
			);
			for (const [k, v] of Object.entries({
				'$io': 'https://duckduckgo.com',
				'$rfp': 'origin',
				'$tf': 'v39tq401',
				'$pf': 'v39tq401',
				'$iframe': '1',
			})) proxied.searchParams.set(k, v);

			const cleaned = await stripScramjetParams(page, proxied.toString());
			const cleanedUrl = new URL(cleaned);
			expect(cleanedUrl.search).toBe('');
			const segment = cleanedUrl.pathname.split('/').at(-1)!;
			expect(await decode(page, segment)).toBe(url);
		});
	}

	// --- stripScramjetParams ---
	test.describe('stripScramjetParams', () => {
		test('strips $io and $rfs', async () => {
			const input = 'https://nyxai.me/?%24io=http%3A%2F%2Fnyxai.me&%24rfs=';
			expect(await stripScramjetParams(page, input)).toBe('https://nyxai.me/');
		});

		test('strips all known QP keys', async () => {
			const u = new URL('https://example.com/');
			for (const k of SCRAMJET_QP_KEYS) u.searchParams.set(k, 'x');
			expect(await stripScramjetParams(page, u.toString())).toBe('https://example.com/');
		});

		test('preserves real query params', async () => {
			const input = 'https://example.com/?q=hello&$io=https%3A%2F%2Fgoogle.com&page=2';
			const out = new URL(await stripScramjetParams(page, input));
			expect(out.searchParams.get('q')).toBe('hello');
			expect(out.searchParams.get('page')).toBe('2');
			expect(out.searchParams.has('$io')).toBe(false);
		});

		test('no-op when no scramjet params', async () => {
			const url = 'https://example.com/?q=test';
			expect(await stripScramjetParams(page, url)).toBe(url);
		});

		test('handles non-URL gracefully', async () => {
			expect(await stripScramjetParams(page, 'not-a-url')).toBe('not-a-url');
		});

		test('strips params from bug-report URL', async () => {
			const input =
				'http://localhost:5173/assets/res/fgbloc5l/qhrmsxpq/dhxbkkzKVpJft5pg6b2Q' +
				'?%24rfp=origin&%24tf=v39tq401&%24pf=v39tq401&%24iframe=1&%24io=https%3A%2F%2Fduckduckgo.com';
			const out = new URL(await stripScramjetParams(page, input));
			expect(out.search).toBe('');
			expect(out.pathname).toBe('/assets/res/fgbloc5l/qhrmsxpq/dhxbkkzKVpJft5pg6b2Q');
		});
	});

	// --- legacy XOR codec ---
	test.describe('legacy XOR codec', () => {
		const legacyCases = [
			'https://google.com',
			'https://example.com/path?foo=bar',
			'https://nyxai.me/',
		];

		for (const url of legacyCases) {
			test(`legacy encode/decode round-trip: ${url}`, async () => {
				const encoded = await page.evaluate((u: string) => {
					function legacyEncode(str: string) {
						if (!str) return str;
						return encodeURIComponent(
							str.split('').map((char, ind) =>
								ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char
							).join('')
						);
					}
					return legacyEncode(u);
				}, url);

				const decoded = await page.evaluate((s: string) => {
					function legacyDecode(str: string) {
						if (!str) return str;
						const [input, ...search] = str.split('?');
						return decodeURIComponent(input)
							.split('').map((char, ind) =>
								ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char
							).join('') + (search.length ? '?' + search.join('?') : '');
					}
					return legacyDecode(s);
				}, encoded);

				expect(decoded).toBe(url);
			});
		}
	});
});
