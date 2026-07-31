import { describe, it, expect, vi } from 'vitest';
import {
	buildShortcutSkeletons,
	hydrateShortcutFavicons,
	type ShortcutRecord,
} from '@pages/newtab/shortcutModel';

describe('newtab shortcut perf helpers', () => {
	it('buildShortcutSkeletons assigns fallback icons without awaiting favicon fetches', () => {
		const fallback = 'fallback-icon';
		const bookmarks = [
			{ id: '1', title: 'Alpha', url: 'https://alpha.test' },
			{ id: '2', title: 'Beta', url: 'https://beta.test' },
		];

		expect(buildShortcutSkeletons(bookmarks, fallback)).toEqual([
			{ id: '1', title: 'Alpha', url: 'https://alpha.test', favicon: fallback },
			{ id: '2', title: 'Beta', url: 'https://beta.test', favicon: fallback },
		]);
	});

	it('hydrateShortcutFavicons only resolves shortcuts still using the fallback icon', async () => {
		const fallback = 'fallback-icon';
		const resolveFavicon = vi.fn(async (url: string) => `icon:${url}`);
		const shortcuts: ShortcutRecord[] = [
			{ id: '1', title: 'Alpha', url: 'https://alpha.test', favicon: fallback },
			{ id: '2', title: 'Beta', url: 'https://beta.test', favicon: 'cached-beta' },
			{ id: '3', title: 'Gamma', url: 'https://gamma.test', favicon: fallback },
		];

		await expect(
			hydrateShortcutFavicons(shortcuts, resolveFavicon, fallback)
		).resolves.toEqual([
			{ id: '1', title: 'Alpha', url: 'https://alpha.test', favicon: 'icon:https://alpha.test' },
			{ id: '2', title: 'Beta', url: 'https://beta.test', favicon: 'cached-beta' },
			{ id: '3', title: 'Gamma', url: 'https://gamma.test', favicon: 'icon:https://gamma.test' },
		]);
		expect(resolveFavicon).toHaveBeenCalledTimes(2);
		expect(resolveFavicon).toHaveBeenNthCalledWith(1, 'https://alpha.test');
		expect(resolveFavicon).toHaveBeenNthCalledWith(2, 'https://gamma.test');
	});

	it('hydrateShortcutFavicons keeps fallback icons when resolution fails', async () => {
		const fallback = 'fallback-icon';
		const resolveFavicon = vi.fn(async () => {
			throw new Error('boom');
		});
		const shortcuts: ShortcutRecord[] = [
			{ id: '1', title: 'Alpha', url: 'https://alpha.test', favicon: fallback },
		];

		await expect(
			hydrateShortcutFavicons(shortcuts, resolveFavicon, fallback)
		).resolves.toEqual(shortcuts);
	});
});
