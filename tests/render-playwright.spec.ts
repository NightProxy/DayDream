import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173/';
const screenshotPath = '/tmp/opencode/playwright-render.png';
const pollOptions = { timeout: 30_000 };
const canonicalPathname = (url: string) =>
	`${new URL(url).pathname.replace(/\/$/, '')}/`;

test('browser shell, iframe, and shared storage render persistently', async () => {
	test.setTimeout(180_000);

	const profileDir = await mkdtemp(join(tmpdir(), 'daydream-playwright-'));
	const testKey = `__playwright_persistence_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	const testValue = `persisted-${Date.now()}`;
	const pageErrors: string[] = [];
	const failedRequests: string[] = [];
	const consoleWarnings: string[] = [];
	const dedicatedWorkers: string[] = [];
	let context:
		| Awaited<ReturnType<typeof chromium.launchPersistentContext>>
		| undefined;
	let page: Page | undefined;
	let sharedWorkerTargets: string[] = [];

	const collectDiagnostics = (target: Page) => {
		target.on('pageerror', error => pageErrors.push(error.message));
		target.on('requestfailed', request => {
			failedRequests.push(
				`${request.url()} ${request.failure()?.errorText ?? 'failed'}`
			);
		});
		target.on('console', message => {
			if (message.type() === 'warning')
				consoleWarnings.push(message.text());
		});
		// Playwright page worker events report dedicated workers, not SharedWorkers.
		target.on('worker', worker => dedicatedWorkers.push(worker.url()));
	};

	const waitForAppGlobals = async (target: Page) => {
		await expect
			.poll(
				() =>
					target.evaluate(() =>
						Boolean(
							(
								window as Window & {
									tabs?: unknown;
									settings?: unknown;
								}
							).tabs &&
							(
								window as Window & {
									tabs?: unknown;
									settings?: unknown;
								}
							).settings
						)
					),
				pollOptions
			)
			.toBe(true);
	};

	try {
		context = await chromium.launchPersistentContext(profileDir, {
			executablePath: '/usr/bin/chromium',
			headless: true,
			viewport: { width: 1365, height: 768 }
		});
		page = context.pages()[0] ?? (await context.newPage());
		collectDiagnostics(page);

		await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
		await waitForAppGlobals(page);
		await expect
			.poll(async () => {
				const frame = page!
					.frames()
					.find(
						candidate =>
							candidate.url() &&
							canonicalPathname(candidate.url()) ===
								'/internal/newtab/'
					);
				if (!frame) return false;
				const bodyText = await frame
					.locator('body')
					.innerText()
					.catch(() => '');
				return bodyText.includes('DayDream');
			}, pollOptions)
			.toBe(true);

		const state = await page.evaluate(() => {
			const host = document.body.firstElementChild as HTMLElement | null;
			const shadow = host?.shadowRoot ?? null;
			const root = shadow?.getElementById('root') ?? null;
			const shell = root?.firstElementChild as HTMLElement | null;
			const identifiableUi = root?.querySelector<HTMLElement>(
				'[data-component="navbar"], [data-component="address-bar"], [data-component="frame-container"]'
			);
			const iframe =
				root?.querySelector<HTMLIFrameElement>('iframe[data-tab-id]') ??
				null;
			const shellStyle = shell ? getComputedStyle(shell) : null;
			const uiStyle = identifiableUi
				? getComputedStyle(identifiableUi)
				: null;
			const iframeStyle = iframe ? getComputedStyle(iframe) : null;
			const shellRect = shell?.getBoundingClientRect();
			const uiRect = identifiableUi?.getBoundingClientRect();
			const iframeRect = iframe?.getBoundingClientRect();

			return {
				hostExists: Boolean(host),
				hostHasOpenShadowRoot: Boolean(shadow),
				rootExists: Boolean(root),
				rootHasRenderedDescendants: Boolean(root?.querySelector('*')),
				shellDisplay: shellStyle?.display ?? 'missing',
				shellVisibility: shellStyle?.visibility ?? 'missing',
				shellOpacity: Number(shellStyle?.opacity ?? 0),
				shellWidth: shellRect?.width ?? 0,
				shellHeight: shellRect?.height ?? 0,
				identifiableUi: identifiableUi?.dataset.component ?? null,
				identifiableUiDisplay: uiStyle?.display ?? 'missing',
				identifiableUiVisibility: uiStyle?.visibility ?? 'missing',
				identifiableUiOpacity: Number(uiStyle?.opacity ?? 0),
				identifiableUiWidth: uiRect?.width ?? 0,
				identifiableUiHeight: uiRect?.height ?? 0,
				iframeExists: Boolean(iframe),
				iframeSrc: iframe?.src ?? null,
				iframeDisplay: iframeStyle?.display ?? 'missing',
				iframeVisibility: iframeStyle?.visibility ?? 'missing',
				iframeOpacity: Number(iframeStyle?.opacity ?? 0),
				iframeWidth: iframeRect?.width ?? 0,
				iframeHeight: iframeRect?.height ?? 0
			};
		});

		expect(state.hostExists).toBe(true);
		expect(state.hostHasOpenShadowRoot).toBe(true);
		expect(state.rootExists).toBe(true);
		expect(state.rootHasRenderedDescendants).toBe(true);
		expect(state.shellDisplay).not.toBe('none');
		expect(state.shellVisibility).toBe('visible');
		expect(state.shellOpacity).toBeGreaterThan(0);
		expect(state.shellWidth).toBeGreaterThan(0);
		expect(state.shellHeight).toBeGreaterThan(0);
		expect(state.identifiableUi).not.toBeNull();
		expect(state.identifiableUiDisplay).not.toBe('none');
		expect(state.identifiableUiVisibility).toBe('visible');
		expect(state.identifiableUiOpacity).toBeGreaterThan(0);
		expect(state.identifiableUiWidth).toBeGreaterThan(0);
		expect(state.identifiableUiHeight).toBeGreaterThan(0);

		expect(state.iframeExists).toBe(true);
		expect(state.iframeDisplay).not.toBe('none');
		expect(state.iframeVisibility).toBe('visible');
		expect(state.iframeOpacity).toBeGreaterThan(0);
		expect(state.iframeWidth).toBeGreaterThan(0);
		expect(state.iframeHeight).toBeGreaterThan(0);
		expect(canonicalPathname(state.iframeSrc!)).toBe('/internal/newtab/');

		const writtenValue = await page.evaluate(
			async ({ key, value }) => {
				const settings = (
					window as Window & {
						settings: {
							getItem: (key: string) => Promise<unknown>;
							setItem: (
								key: string,
								value: unknown
							) => Promise<unknown>;
						};
					}
				).settings;
				await settings.setItem(key, value);
				return settings.getItem(key);
			},
			{ key: testKey, value: testValue }
		);
		expect(writtenValue).toBe(testValue);

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitForAppGlobals(page);
		await expect
			.poll(
				() =>
					page!.evaluate(
						key =>
							(
								window as Window & {
									settings: {
										getItem: (
											key: string
										) => Promise<unknown>;
									};
								}
							).settings.getItem(key),
						testKey
					),
				pollOptions
			)
			.toBe(testValue);

		const secondPage = await context.newPage();
		collectDiagnostics(secondPage);
		await secondPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
		await waitForAppGlobals(secondPage);
		await expect
			.poll(
				() =>
					secondPage.evaluate(
						key =>
							(
								window as Window & {
									settings: {
										getItem: (
											key: string
										) => Promise<unknown>;
									};
								}
							).settings.getItem(key),
						testKey
					),
				pollOptions
			)
			.toBe(testValue);

		const cdp = await context.newCDPSession(page);
		await expect
			.poll(async () => {
				const { targetInfos } = await cdp.send('Target.getTargets');
				sharedWorkerTargets = targetInfos
					.filter(
						target =>
							target.type === 'shared_worker' &&
							target.url.includes('storage.shared-worker')
					)
					.map(target => target.url);
				return sharedWorkerTargets.length;
			}, pollOptions)
			.toBeGreaterThan(0);
		expect(
			dedicatedWorkers.some(url => url.includes('storage.worker'))
		).toBe(false);
		expect(
			consoleWarnings.some(message =>
				message.includes(
					'Shared storage worker unavailable; using main-thread storage'
				)
			)
		).toBe(false);

		console.log(
			JSON.stringify(
				{ state, sharedWorkerTargets, consoleWarnings },
				null,
				2
			)
		);
	} finally {
		if (page && !page.isClosed()) {
			await page
				.evaluate(
					key =>
						(
							window as Window & {
								settings?: {
									removeItem: (key: string) => Promise<void>;
								};
							}
						).settings?.removeItem(key),
					testKey
				)
				.catch(() => undefined);
			await page
				.screenshot({ path: screenshotPath, fullPage: true })
				.catch(() => undefined);
		}
		console.log(
			JSON.stringify(
				{
					pageErrors,
					failedRequests,
					consoleWarnings,
					dedicatedWorkers,
					sharedWorkerTargets
				},
				null,
				2
			)
		);
		await context?.close().catch(() => undefined);
		await rm(profileDir, { recursive: true, force: true });
	}
});
