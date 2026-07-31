export interface ShortcutRecord {
	id: string;
	title: string;
	url: string;
	favicon: string;
}

export function buildShortcutSkeletons(
	bookmarks: Array<Pick<ShortcutRecord, 'id' | 'title' | 'url'>>,
	fallbackFavicon: string,
): ShortcutRecord[] {
	return bookmarks.map(bookmark => ({
		...bookmark,
		favicon: fallbackFavicon,
	}));
}

export async function hydrateShortcutFavicons(
	shortcuts: ShortcutRecord[],
	resolveFavicon: (url: string) => Promise<string>,
	fallbackFavicon: string,
): Promise<ShortcutRecord[]> {
	return Promise.all(
		shortcuts.map(async shortcut => {
			if (shortcut.favicon !== fallbackFavicon) {
				return shortcut;
			}

			try {
				const favicon = await resolveFavicon(shortcut.url);
				return {
					...shortcut,
					favicon: favicon || fallbackFavicon,
				};
			} catch {
				return shortcut;
			}
		}),
	);
}
