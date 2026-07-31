import './helpers/opfsStub';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CfClearanceWatcher } from '@apis/captcha';

/**
 * Note on decodeProxiedUrl: the watcher routes iframe.src through
 * decodeProxiedUrl. For an https://… URL with no protocol prefix the
 * decoder falls through every step and returns the input verbatim,
 * so we can use real-looking URLs in tests without mocking the
 * decoder itself.
 */

function fireIframeLoaded(tabId: string, src: string) {
	const iframe = document.createElement('iframe');
	iframe.src = src;
	document.body.appendChild(iframe);
	document.dispatchEvent(
		new CustomEvent('iframeLoaded', {
			detail: { tabId, iframe, tabElement: document.createElement('div') }
		})
	);
	return iframe;
}

async function tick(times = 1) {
	for (let i = 0; i < times; i++) {
		await new Promise((r) => setTimeout(r, 0));
	}
}

describe('CfClearanceWatcher — heuristic', () => {
	let teardown: (() => void) | null = null;
	beforeEach(() => {
		document.body.innerHTML = '';
	});
	afterEach(() => {
		if (teardown) {
			teardown();
			teardown = null;
		}
	});

	it('does NOT trigger on 2 loads of the same URL', async () => {
		const clearFn = vi.fn().mockResolvedValue({ cookies: [], userAgent: 'x' });
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn().mockResolvedValue(true) },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: clearFn
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		await tick(3);

		expect(clearFn).not.toHaveBeenCalled();
		expect(watcher.getStats().cfBlockDetections).toBe(0);
	});

	it('triggers on 3 loads of the same URL within window', async () => {
		const clearFn = vi
			.fn()
			.mockResolvedValue({
				cookies: [{ name: 'cf_clearance', value: 'XYZ' }],
				userAgent: 'UA'
			});
		const navigateFn = vi.fn().mockResolvedValue(true);
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: navigateFn },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: clearFn
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		await tick(5);

		expect(clearFn).toHaveBeenCalledOnce();
		expect(navigateFn).toHaveBeenCalledOnce();
		expect(watcher.getStats().cfBlockDetections).toBe(1);
		expect(watcher.getStats().clearanceSuccesses).toBe(1);
	});

	it('resets on URL change — 2+2 different URLs does NOT trigger', async () => {
		const clearFn = vi.fn().mockResolvedValue({ cookies: [], userAgent: 'x' });
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn().mockResolvedValue(true) },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: clearFn
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://a.example.com/');
		fireIframeLoaded('tab-1', 'https://a.example.com/');
		fireIframeLoaded('tab-1', 'https://b.example.com/');
		fireIframeLoaded('tab-1', 'https://b.example.com/');
		await tick(3);

		expect(clearFn).not.toHaveBeenCalled();
	});

	it('does NOT trigger when not Night+', async () => {
		const clearFn = vi.fn().mockResolvedValue({ cookies: [], userAgent: 'x' });
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn().mockResolvedValue(true) },
			checkNightPlusStatus: async () => false,
			clearCloudflareFor: clearFn
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		await tick(3);

		// Detector still fires (cfBlockDetections increments),
		// but no backend call.
		expect(watcher.getStats().cfBlockDetections).toBe(1);
		expect(clearFn).not.toHaveBeenCalled();
	});

	it('skips non-http(s) URLs (ddx://, about:, etc.)', async () => {
		const clearFn = vi.fn();
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn() },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: clearFn as unknown as (
				url: string,
				ua: string
			) => Promise<{
				cookies: never[];
				userAgent: string;
			}>
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'about:blank');
		fireIframeLoaded('tab-1', 'about:blank');
		fireIframeLoaded('tab-1', 'about:blank');
		await tick(3);

		expect(watcher.getStats().cfBlockDetections).toBe(0);
		expect(clearFn).not.toHaveBeenCalled();
	});

	it('marks failure when cookie inject fails (no cookieJar)', async () => {
		const clearFn = vi.fn().mockResolvedValue({
			cookies: [{ name: 'cf_clearance', value: 'XYZ' }],
			userAgent: 'UA'
		});
		const watcher = new CfClearanceWatcher({
			controller: {}, // no cookieJar
			proxy: { navigateFrame: vi.fn().mockResolvedValue(true) },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: clearFn
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		await tick(5);

		expect(clearFn).toHaveBeenCalledOnce();
		expect(watcher.getStats().clearanceFailures).toBe(1);
		expect(watcher.getStats().clearanceSuccesses).toBe(0);
	});

	it('marks failure when backend throws', async () => {
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn() },
			checkNightPlusStatus: async () => true,
			clearCloudflareFor: async () => {
				throw new Error('endpoint_not_found');
			}
		});
		teardown = watcher.install();

		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		fireIframeLoaded('tab-1', 'https://blocked.example.com/');
		await tick(5);

		expect(watcher.getStats().clearanceFailures).toBe(1);
	});

	it('manual runManualClearance respects the Night+ gate', async () => {
		const clearFn = vi.fn();
		const watcher = new CfClearanceWatcher({
			controller: { cookieJar: { setCookies: () => {} } },
			proxy: { navigateFrame: vi.fn() },
			checkNightPlusStatus: async () => false,
			clearCloudflareFor: clearFn as unknown as (
				url: string,
				ua: string
			) => Promise<{ cookies: never[]; userAgent: string }>
		});
		teardown = watcher.install();

		const iframe = document.createElement('iframe');
		const result = await watcher.runManualClearance(
			iframe,
			'https://example.com'
		);
		expect(result.cleared).toBe(false);
		expect(result.reason).toBe('unauthorized');
		expect(clearFn).not.toHaveBeenCalled();
	});
});
