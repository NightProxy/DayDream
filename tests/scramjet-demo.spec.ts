/**
 * Playwright test: Scramjet demo with Obscura codec wired exactly as DDX does.
 *
 * Spins up against the DDX devserver (reuses existing if running).
 * The demo page at /scramjet-demo/ registers a SW that loads:
 *   /assets/config.js  — sets __scramjet$config with the obscura codec
 *   /assets/sw.js      — controller SW
 * The main page loads /assets/api.js for ScramjetController.
 */
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

const DEMO_URL = `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'}/scramjet-demo/index.html`;
const POLL = { timeout: 30_000 };

async function waitForDemoReady(page: Page) {
	await expect.poll(
		() => page.evaluate(() => (window as any).__demoReady === true),
		{ ...POLL, message: 'demo did not become ready' }
	).toBe(true);
}

async function obscuraReady(page: Page): Promise<boolean> {
	return page.evaluate(() => (window as any).__obscura?.ready === true);
}

test.describe('Scramjet demo — Obscura codec integration', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		page.on('console', msg => {
			if (msg.type() === 'error') console.error('[page]', msg.text());
		});
		await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' });
		await waitForDemoReady(page);
	});

	test.afterAll(async () => {
		await page?.close();
	});

	test('demo page loads and controller initialises', async () => {
		const status = await page.locator('#status').innerText();
		expect(status).toBe('Ready');
	});

	test('ScramjetController is on window', async () => {
		const has = await page.evaluate(() => typeof (window as any).__scramjetController === 'object');
		expect(has).toBe(true);
	});

	test('__obscura is ready (WASM loaded by api.js IIFE)', async () => {
		expect(await obscuraReady(page)).toBe(true);
	});

	test('codec encode/decode round-trips via __obscura', async () => {
		const cases = [
			'https://google.com',
			'https://nyxai.me/',
			'https://duckduckgo.com/?q=test',
			'https://www.youtube.com/watch?v=abc123',
		];
		for (const url of cases) {
			const result = await page.evaluate((u) => {
				const ob = (window as any).__obscura;
				const token = ob.encode(u);
				return { token, decoded: ob.decode(token) };
			}, url);
			expect(result.token).toBeTruthy();
			expect(result.token).not.toBe(url);
			expect(result.decoded).toBe(url);
		}
	});

	test('codec encode produces a daylight token (is_daylight_token)', async () => {
		const result = await page.evaluate(() => {
			const ob = (window as any).__obscura;
			const token = ob.encode('https://google.com');
			return { token, isToken: ob.isDaylightToken(token) };
		});
		expect(result.isToken).toBe(true);
	});

	test('controller codec matches __obscura (same encode output)', async () => {
		const result = await page.evaluate(() => {
			const ob = (window as any).__obscura;
			const ctrl = (window as any).__scramjetController;
			const url = 'https://example.com/path?q=test';
			const fromObscura = ob.encode(url);
			const fromCtrl = ctrl.config?.codec?.encode(url);
			return { fromObscura, fromCtrl, match: fromObscura === fromCtrl };
		});
		expect(result.match).toBe(true);
	});

	test('scramjet prefix is /assets/res/', async () => {
		const prefix = await page.evaluate(
			() => (window as any).__scramjetController?.config?.prefix
		);
		expect(prefix).toBe('/assets/res/');
	});

	test('proxied URL has correct structure (prefix + encoded token)', async () => {
		const result = await page.evaluate(() => {
			const ob = (window as any).__obscura;
			const prefix = '/assets/res/';
			const url = 'https://example.com/';
			const token = ob.encode(url);
			const proxied = prefix + token;
			// Reconstruct: strip prefix, decode last segment
			const segment = proxied.slice(prefix.length).split('/').at(-1)!;
			return { proxied, decoded: ob.decode(segment), token };
		});
		expect(result.decoded).toBe('https://example.com/');
	});

	test('Scramjet QP keys are stripped from proxied URLs', async () => {
		const result = await page.evaluate(() => {
			const QP_KEYS = new Set([
				'$rfp', '$rfs', '$module', '$tf', '$pf', '$iframe',
				'$mode', '$cred', '$dest', '$io', '$fs', '$csr', '$fakedataurl',
			]);
			function strip(url: string) {
				try {
					const u = new URL(url);
					let changed = false;
					for (const k of [...u.searchParams.keys()]) {
						if (QP_KEYS.has(k)) { u.searchParams.delete(k); changed = true; }
					}
					return changed ? u.toString() : url;
				} catch { return url; }
			}
			const ob = (window as any).__obscura;
			const token = ob.encode('https://nyxai.me/');
			const proxied = new URL('/assets/res/fgbloc5l/qhrmsxpq/' + token, location.href);
			proxied.searchParams.set('$io', 'https://duckduckgo.com');
			proxied.searchParams.set('$rfp', 'origin');
			proxied.searchParams.set('$iframe', '1');
			const cleaned = strip(proxied.toString());
			const cleanUrl = new URL(cleaned);
			const segment = cleanUrl.pathname.split('/').at(-1)!;
			return {
				hasNoQP: cleanUrl.search === '',
				decoded: ob.decode(segment),
			};
		});
		expect(result.hasNoQP).toBe(true);
		expect(result.decoded).toBe('https://nyxai.me/');
	});

	test('service worker is active for demo scope', async () => {
		const swUrl = await page.evaluate(async () => {
			const reg = await navigator.serviceWorker.getRegistration('/scramjet-demo/index.html');
			return reg?.active?.scriptURL ?? null;
		});
		expect(swUrl).toContain('/scramjet-demo/sw.js');
	});
});
