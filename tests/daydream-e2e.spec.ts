/**
 * Daydream end-to-end Playwright spec.
 *
 * Boots the full app through the devserver (reuses if already running),
 * loads it in a real persistent-context Chromium, exercises:
 *   - App boot & globals (proxy, tabs, settings, cache)
 *   - Proxy / Scramjet setup (SW, codec, prefix)
 *   - Newtab renders inside the iframe
 *   - Tab management (create, navigate, close)
 *   - Proxy navigation to real sites (google, spotify, discord, duckduckgo)
 *   - Omnibox search dispatch
 *   - Session persistence (settings survive reload)
 *   - URL decoding (address bar shows real URL)
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const POLL = { timeout: 45_000 };

interface ErrorDiagnostic {
	message: string;
	stack: string;
	fromProxiedFrame: boolean;
}

function isKnownHostBootError(error: ErrorDiagnostic): boolean {
	return error.message.includes('Unexpected end of JSON input') &&
		error.stack.includes('@terbiumos_tfs_browser');
}

function isProxyRuntimeFailure(error: ErrorDiagnostic): boolean {
	if (/unable to parse rewritten url|Internal Service Worker Error|URL using bad\/illegal format|codec.*(?:decode|encode)|obscura.*(?:failed|error)/i.test(error.message)) {
		return true;
	}
	return !error.fromProxiedFrame && /is not valid JSON/i.test(error.message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalPathname(url: string): string {
	try {
		return new URL(url).pathname.replace(/\/$/, '') + '/';
	} catch {
		return url;
	}
}

async function waitForAppGlobals(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						Boolean(
							(window as any).tabs &&
								(window as any).proxy &&
								(window as any).settings
							)
					),
				POLL
			)
		.toBe(true);
}

async function waitForProxyReady(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						Boolean(
							(window as any).proxy?.controller &&
								(window as any).__scramjet$config?.codec
							)
					),
				POLL
			)
		.toBe(true);
}

async function waitForNewtab(page: Page): Promise<void> {
	await expect
		.poll(async () => {
			const frame = page
				.frames()
				.find(
					f =>
						f.url() &&
						canonicalPathname(f.url()) === '/internal/newtab/'
				);
			if (!frame) return false;
			const body = await frame
				.locator('body')
				.innerText()
				.catch(() => '');
			return body.length > 0;
		}, POLL)
		.toBe(true);
}

/** Navigate the active tab via window.proxy.redirect() */
async function proxyNavigate(page: Page, url: string): Promise<void> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			await page.evaluate(async (u: string) => {
				const proxy = (window as any).proxy;
				const swConfig = (window as any).SWconfig;
				const proxySetting = (window as any).ProxySettings;
				await proxy.redirect(swConfig, proxySetting, u);
			}, url);
			return;
		} catch (error) {
			if (attempt === 1 || !String(error).includes('Execution context was destroyed')) {
				throw error;
			}
			await page.waitForLoadState('domcontentloaded').catch(() => undefined);
			await waitForAppGlobals(page);
		}
	}
}

/** Get the decoded URL currently shown to the user for a tab */
async function getActiveDecodedUrl(page: Page): Promise<string> {
	return page.evaluate(() => {
		const proxy = (window as any).proxy;
		const iframe = document.querySelector('iframe.active') as HTMLIFrameElement | null;
		if (!iframe) return '';
		return proxy?.extractEncodedUrl?.(iframe) ?? iframe.src ?? '';
	});
}

/** Wait for the active iframe's decoded URL to include a substring */
async function waitForNavigation(page: Page, urlSubstr: string): Promise<void> {
	await expect
		.poll(async () => {
			const url = await getActiveDecodedUrl(page);
			return url.includes(urlSubstr);
		}, POLL)
		.toBe(true);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Daydream full app', () => {
	let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
	let page: Page;
	let profileDir: string;

	const pageErrors: ErrorDiagnostic[] = [];
	const consoleErrors: ErrorDiagnostic[] = [];
	const failedRequests: string[] = [];

	test.beforeAll(async () => {
		test.setTimeout(180_000);
		profileDir = await mkdtemp(join(tmpdir(), 'daydream-e2e-'));
		context = await chromium.launchPersistentContext(profileDir, {
			executablePath: '/usr/bin/chromium',
			headless: true,
			viewport: { width: 1280, height: 720 },
		});
		page = context.pages()[0] ?? (await context.newPage());
		page.on('pageerror', error => {
			const stack = error.stack ?? '';
			pageErrors.push({
				message: error.message,
				stack,
				fromProxiedFrame: stack.includes('/assets/res/'),
			});
		});
		page.on('console', message => {
			if (message.type() !== 'error') return;
			const location = message.location();
			const text = message.text();
			const stack = `${location.url}\n${text}`;
			consoleErrors.push({
				message: text,
				stack,
				fromProxiedFrame: stack.includes('/assets/res/'),
			});
		});
		page.on('requestfailed', r =>
			failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? 'failed'}`)
		);
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		await waitForAppGlobals(page);
		await waitForProxyReady(page);
	});

	test.afterAll(async () => {
		await context?.close().catch(() => undefined);
		await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
	});

	// --- Boot & globals ---

	test('window.proxy is set', async () => {
		const has = await page.evaluate(() => typeof (window as any).proxy === 'object');
		expect(has).toBe(true);
	});

	test('window.tabs is set', async () => {
		const has = await page.evaluate(() => typeof (window as any).tabs === 'object');
		expect(has).toBe(true);
	});

	test('window.settings is set', async () => {
		const has = await page.evaluate(() => typeof (window as any).settings === 'object');
		expect(has).toBe(true);
	});

	test('window.cache is set', async () => {
		const has = await page.evaluate(() => typeof (window as any).cache === 'object');
		expect(has).toBe(true);
	});

	test('window.SWconfig and ProxySettings are set', async () => {
		const result = await page.evaluate(() => ({
			swConfig: typeof (window as any).SWconfig,
			proxySetting: (window as any).ProxySettings,
		}));
		expect(result.swConfig).toBe('object');
		expect(result.proxySetting).toBe('sj');
	});

	// --- Scramjet / proxy setup ---

	test('__scramjet$config is set with obscura codec and correct prefix', async () => {
		const cfg = await page.evaluate(() => {
			const c = (window as any).__scramjet$config;
			return {
				hasCodec: typeof c?.codec?.encode === 'function' && typeof c?.codec?.decode === 'function',
				prefix: c?.prefix ?? null,
			};
		});
		expect(cfg.hasCodec).toBe(true);
		expect(cfg.prefix).toMatch(/assets\/res\/$/);
	});

	test('__obscura is ready', async () => {
		// obscura-init.js is loaded with `defer` — poll until WASM init completes
		await expect
			.poll(
				() => page.evaluate(() => (window as any).__obscura?.ready === true),
				POLL
			)
			.toBe(true);
	});

	test('proxy controller is initialised', async () => {
		const has = await page.evaluate(() => Boolean((window as any).proxy?.controller));
		expect(has).toBe(true);
	});

	test('service worker is active for app scope', async () => {
		const swUrl = await page.evaluate(async () => {
			const reg = await navigator.serviceWorker.getRegistration('/');
			return reg?.active?.scriptURL ?? null;
		});
		expect(swUrl).not.toBeNull();
		expect(swUrl).toMatch(/sw\.js$/);
	});

	// --- Shell renders ---

	test('shadow-DOM shell renders with non-zero size', async () => {
		const state = await page.evaluate(() => {
			const host = document.body.firstElementChild as HTMLElement | null;
			const shadow = host?.shadowRoot ?? null;
			const root = shadow?.getElementById('root') ?? null;
			const shell = root?.firstElementChild as HTMLElement | null;
			const rect = shell?.getBoundingClientRect();
			return {
				hasShadow: Boolean(shadow),
				hasRoot: Boolean(root),
				width: rect?.width ?? 0,
				height: rect?.height ?? 0,
			};
		});
		expect(state.hasShadow).toBe(true);
		expect(state.hasRoot).toBe(true);
		expect(state.width).toBeGreaterThan(0);
		expect(state.height).toBeGreaterThan(0);
	});

	test('newtab iframe exists and points to /internal/newtab/', async () => {
		await waitForNewtab(page);
		const src = await page.evaluate(() => {
			const iframe = document.querySelector('iframe[data-tab-id]') as HTMLIFrameElement | null;
			return iframe?.src ?? null;
		});
		expect(src).not.toBeNull();
		expect(canonicalPathname(src!)).toBe('/internal/newtab/');
	});

	test('address bar input element is present', async () => {
		const found = await page.evaluate(() =>
			Boolean(
				document.querySelector('input[data-component="address-bar"]') ??
				document.querySelector('input[placeholder*="Search"]') ??
				document.querySelector('input[type="text"]')
			)
		);
		expect(found).toBe(true);
	});

	// --- Tab lifecycle ---

	test('tabs.createTab() creates a new tab', async () => {
		const before = await page.evaluate(() => (window as any).tabs.tabs.length as number);
		await page.evaluate(async () => {
			await (window as any).tabs.createTab('ddx://newtab/');
		});
		const after = await page.evaluate(() => (window as any).tabs.tabs.length as number);
		expect(after).toBeGreaterThan(before);
	});

	test('closing the extra tab restores count', async () => {
		const before = await page.evaluate(() => (window as any).tabs.tabs.length as number);
		const lastId = await page.evaluate(() => {
			const tabs = (window as any).tabs.tabs as Array<{ id: string }>;
			return tabs[tabs.length - 1]?.id ?? null;
		});
		if (lastId) {
			await page.evaluate(async (id: string) => {
				await (window as any).tabs.closeTabById(id);
			}, lastId);
		}
		const after = await page.evaluate(() => (window as any).tabs.tabs.length as number);
		expect(after).toBeLessThan(before);
	});

	// --- Proxy navigation to real sites ---

	test.describe('proxy navigation', () => {
		const sites: Array<{ name: string; url: string; substr: string }> = [
			{ name: 'google', url: 'https://google.com', substr: 'google.com' },
			{ name: 'duckduckgo', url: 'https://duckduckgo.com', substr: 'duckduckgo.com' },
			{ name: 'spotify', url: 'https://open.spotify.com', substr: 'spotify.com' },
			{ name: 'discord', url: 'https://discord.com', substr: 'discord.com' },
		];

		for (const { name, url, substr } of sites) {
			test(`proxy.redirect navigates to ${name}`, async () => {
				test.setTimeout(90_000);
				await proxyNavigate(page, url);

				// Active iframe src should be a scramjet-rewritten URL
				await expect
					.poll(async () => {
						const src = await page.evaluate(
							() =>
								(document.querySelector('iframe.active') as HTMLIFrameElement | null)
									?.src ?? ''
						);
						return src.includes('/assets/res/');
					}, POLL)
					.toBe(true);

				// Decoded URL contains the target domain
				await waitForNavigation(page, substr);

			});
		}
	});

	test('typing a URL keeps the address bar on the decoded URL', async () => {
		const addressBar = page.locator('[data-component="address-bar"]');
		await addressBar.fill('https://google.com');
		await addressBar.press('Enter');
		await waitForNavigation(page, 'google.com');
		await expect
			.poll(() => addressBar.inputValue(), { timeout: 10_000 })
			.toContain('google.com');
		expect(await addressBar.inputValue()).not.toContain('/assets/res/');
		expect(await addressBar.inputValue()).not.toMatch(/^file:/);
	});

	// --- Codec: encode/decode round-trip via proxy ---

	test('proxy.encodeUrl / decodeUrl round-trip', async () => {
		const urls = [
			'https://google.com',
			'https://duckduckgo.com/?q=test',
			'https://open.spotify.com/track/abc123',
			'https://discord.com/channels/@me',
		];
		for (const url of urls) {
			const result = await page.evaluate((u: string) => {
				const proxy = (window as any).proxy;
				const token = proxy.encodeUrl(u);
				return { token, decoded: proxy.decodeUrl(token) };
			}, url);
			expect(result.token).toBeTruthy();
			expect(result.token).not.toBe(url);
			expect(result.decoded).toBe(url);
		}
	});

	// --- Omnibox search ---

	test('proxy.search() routes plain text through default engine', async () => {
		const result = await page.evaluate(() =>
			(window as any).proxy.search('hello world')
		);
		expect(result).toContain('hello');
		expect(result).toMatch(/^https?:\/\//);
	});

	test('proxy.search() passes through full URLs', async () => {
		const result = await page.evaluate(() =>
			(window as any).proxy.search('https://example.com/')
		);
		expect(result).toBe('https://example.com/');
	});

	// --- Settings persistence ---

	test('settings.setItem / getItem round-trip', async () => {
		const key = `__e2e_test_${Date.now()}`;
		const val = `val_${Math.random().toString(36).slice(2)}`;
		let stored: unknown;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				stored = await page.evaluate(
					async ({ k, v }: { k: string; v: string }) => {
						const s = (window as any).settings;
						await s.setItem(k, v);
						return s.getItem(k);
					},
					{ k: key, v: val }
				);
				break;
			} catch (error) {
				if (attempt === 1 || !String(error).includes('Execution context was destroyed')) {
					throw error;
				}
				await page.waitForLoadState('domcontentloaded').catch(() => undefined);
				await waitForAppGlobals(page);
			}
		}
		expect(stored).toBe(val);
	});

	test('settings survive a page reload', async () => {
		const key = `__e2e_persist_${Date.now()}`;
		const val = `persist_${Math.random().toString(36).slice(2)}`;
		await page.evaluate(
			async ({ k, v }: { k: string; v: string }) => {
				await (window as any).settings.setItem(k, v);
			},
			{ k: key, v: val }
		);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitForAppGlobals(page);
		await expect
			.poll(
				() =>
					page.evaluate(
						(k: string) => (window as any).settings.getItem(k),
						key
					),
				POLL
			)
			.toBe(val);
	});

	// --- Multi-tab shared storage ---

	test('settings written in one tab are readable in a second tab', async () => {
		const key = `__e2e_shared_${Date.now()}`;
		const val = `shared_${Math.random().toString(36).slice(2)}`;
		await page.evaluate(
			async ({ k, v }: { k: string; v: string }) => {
				await (window as any).settings.setItem(k, v);
			},
			{ k: key, v: val }
		);
		const page2 = await context!.newPage();
		try {
			await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
			await waitForAppGlobals(page2);
			await expect
				.poll(
					() =>
						page2.evaluate(
							(k: string) => (window as any).settings.getItem(k),
							key
						),
					POLL
				)
				.toBe(val);
		} finally {
			await page2.close().catch(() => undefined);
		}
	});

	// --- URL decoder ---

	test('decodeProxiedUrl strips scramjet QP keys', async () => {
		const result = await page.evaluate(() => {
			// Construct a URL that looks like what Scramjet would produce
			const proxy = (window as any).proxy;
			const prefix = (window as any).__scramjet$config?.prefix ?? '/assets/res/';
			const token = proxy.encodeUrl('https://google.com');
			const proxied = new URL(prefix + token, location.href);
			proxied.searchParams.set('$io', 'https://duckduckgo.com');
			proxied.searchParams.set('$rfp', 'origin');
			// Decode using the same logic the address bar uses
			const decoded = proxy.extractEncodedUrl(null, {
				url: proxied.toString(),
				prefix,
			});
			return { decoded, proxiedSearch: proxied.search };
		});
		// Proxied URL had QP keys
		expect(result.proxiedSearch).not.toBe('');
		// Decoded URL should be plain google.com
		expect(result.decoded).toContain('google.com');
		expect(result.decoded).not.toContain('$io');
	});

	// --- No critical errors ---

	test('reports proxied-frame errors and rejects host or proxy runtime failures', () => {
		const proxiedSiteErrors = pageErrors.filter(
			error => error.fromProxiedFrame && !isProxyRuntimeFailure(error)
		);
		if (proxiedSiteErrors.length > 0) {
			console.log('Proxied-site diagnostics:', JSON.stringify(proxiedSiteErrors, null, 2));
		}
		const unclassifiedErrors = pageErrors.filter(
			error => !error.stack || error.message === 'Object'
		);
		if (unclassifiedErrors.length > 0) {
			console.warn('Unclassified page diagnostics:', JSON.stringify(unclassifiedErrors, null, 2));
		}

		const criticalPageErrors = pageErrors.filter(
			error =>
				error.stack.length > 0 &&
				!error.fromProxiedFrame &&
				!isKnownHostBootError(error) &&
				!error.message.includes('ResizeObserver loop') &&
				!error.message.includes('Non-Error promise rejection') &&
				!error.message.includes('port handshake failed')
		);
		const criticalConsoleErrors = consoleErrors.filter(isProxyRuntimeFailure);
		if (criticalPageErrors.length || criticalConsoleErrors.length) {
			console.error('Critical Daydream diagnostics:', JSON.stringify({
				pageErrors: criticalPageErrors,
				consoleErrors: criticalConsoleErrors,
			}, null, 2));
		}
		expect(criticalPageErrors).toHaveLength(0);
		expect(criticalConsoleErrors).toHaveLength(0);
	});
});
