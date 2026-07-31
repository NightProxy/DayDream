import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './index';

describe('Tabs bookmark navigation', () => {
	it('routes registered bookmark URLs through Protocols.navigate', async () => {
		const frameContainer = document.createElement('div');
		const iframe = document.createElement('iframe');
		iframe.className = 'active';
		frameContainer.appendChild(iframe);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const tabs = {
			items: { frameContainer },
			proto: { isRegisteredProtocol: vi.fn().mockReturnValue(true), navigate },
		};

		await (Tabs.prototype as any).navigateBookmarkActiveFrame.call(
			tabs,
			'ddx://settings/'
		);

		expect(navigate).toHaveBeenCalledWith('ddx://settings/');
	});

	it('routes normal bookmark URLs through Proxy.redirect with the active iframe', async () => {
		const frameContainer = document.createElement('div');
		const iframe = document.createElement('iframe');
		iframe.className = 'active';
		frameContainer.appendChild(iframe);
		const swConfig = { scramjet: { config: {} } };
		const redirect = vi.fn().mockResolvedValue(undefined);
		const tabs = {
			items: { frameContainer },
			proto: { isRegisteredProtocol: vi.fn().mockReturnValue(false) },
			proxy: { redirect },
			swConfig,
			proxySetting: 'scramjet',
		};

		await (Tabs.prototype as any).navigateBookmarkActiveFrame.call(
			tabs,
			'https://example.test'
		);

		expect(redirect).toHaveBeenCalledWith(
			swConfig,
			'scramjet',
			'https://example.test',
			iframe
		);
	});
});
