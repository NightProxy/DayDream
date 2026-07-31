import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pages/shared/themeInit', () => ({}));
vi.mock('@utils/global/panic', () => ({}));

import { navigateBookmark } from './index';

afterEach(() => {
	document.body.replaceChildren();
	delete (window as Partial<Window>).proxy;
	delete (window as Partial<Window>).tabs;
	vi.restoreAllMocks();
});

describe('navigateBookmark', () => {
	it('navigates the active frame through the parent proxy', async () => {
		const navigateFrame = vi.fn().mockResolvedValue(true);
		const createTab = vi.fn();
		const frame = document.createElement('iframe');
		frame.className = 'active';
		document.body.appendChild(frame);
		window.proxy = { navigateFrame } as any;
		window.tabs = { createTab } as any;

		await navigateBookmark('https://example.test');

		expect(navigateFrame).toHaveBeenCalledWith(
			frame,
			'https://example.test'
		);
		expect(createTab).not.toHaveBeenCalled();
	});

	it('opens a new tab when active-frame navigation fails', async () => {
		const navigateFrame = vi.fn().mockResolvedValue(false);
		const createTab = vi.fn();
		const frame = document.createElement('iframe');
		frame.className = 'active';
		document.body.appendChild(frame);
		window.proxy = { navigateFrame } as any;
		window.tabs = { createTab } as any;

		await navigateBookmark('https://example.test');

		expect(createTab).toHaveBeenCalledWith('https://example.test');
	});
});
