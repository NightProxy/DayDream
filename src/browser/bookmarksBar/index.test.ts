import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkItem } from '../../apis/bookmarks';
import { BookmarksBar, type BookmarksBarDeps } from './index';

vi.mock('lucide', () => ({
	createIcons: ({ icons, root }: { icons?: Record<string, unknown>; root?: ParentNode } = {}) => {
		root?.querySelectorAll<HTMLElement>('[data-lucide]').forEach((icon) => {
			const iconName = icon.dataset.lucide
				?.split('-')
				.map((part) => part[0].toUpperCase() + part.slice(1))
				.join('');
			if (!iconName || !icons?.[iconName]) return;
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.classList.add(...icon.classList);
			icon.replaceWith(svg);
		});
	},
	ChevronDown: {},
	ChevronRight: {},
	ChevronsRight: {},
	Folder: {},
	Globe: {},
	Plus: {},
}));

class BookmarkManagerDouble {
	private readonly listeners = new Set<() => void>();
	readonly deleteBookmark = vi.fn(async (_id: string) => true);
	readonly deleteFolder = vi.fn(async (_id: string, _deleteContents: boolean) => true);
	readonly createBookmark = vi.fn(async (_bookmark: { title: string; url: string }) => null);
	readonly createFolder = vi.fn(async (_folder: { title: string }) => null);
	readonly moveItem = vi.fn(async (_data: unknown) => true);
	readonly updateBookmark = vi.fn(async (_id: string, _updates: unknown) => null);
	readonly updateFolder = vi.fn(async (_id: string, _updates: unknown) => null);

	constructor(private readonly items: BookmarkItem[]) {}

	addListener(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit() {
		for (const listener of this.listeners) listener();
	}

	getItemsByParent(parentId?: string) {
		return this.items.filter((item) => item.parentId === parentId);
	}

	getItemById(id: string) {
		return this.items.find((item) => item.id === id) ?? null;
	}

	getCachedFavicon(_url: string) {
		return null;
	}
}

class SettingsDouble {
	readonly setItem = vi.fn(async (_key: string, _value: string) => _value);

	constructor(private readonly values: Record<string, string> = {}) {}

	async getItem(key: string) {
		return this.values[key] ?? null;
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const now = new Date();

function bookmark(id: string, title: string, parentId?: string): BookmarkItem {
	return {
		id,
		title,
		url: `https://${id}.test`,
		parentId,
		createdAt: now,
		updatedAt: now,
		index: 0,
	};
}

function folder(id: string, title: string, parentId?: string): BookmarkItem {
	return { id, title, parentId, createdAt: now, updatedAt: now, index: 0 };
}

function mount(
	items: BookmarkItem[],
	settings?: BookmarksBarDeps['settings'],
	overrides: Partial<BookmarksBarDeps> = {}
) {
	const root = document.createElement('div');
	document.body.appendChild(root);
	const manager = new BookmarkManagerDouble(items);
	const bar = new BookmarksBar({
		bookmarkManager: manager,
		navigateActiveFrame: vi.fn().mockResolvedValue(true),
		settings,
		...overrides,
	});
	bar.init(root);
	return { root, manager, bar, settings };
}

function rightClick(element: Element, clientX = 0, clientY = 0) {
	const event = new MouseEvent('contextmenu', {
		bubbles: true,
		cancelable: true,
		button: 2,
		clientX,
		clientY,
	});
	element.dispatchEvent(event);
	return event;
}

function contextMenu() {
	return document.querySelector<HTMLElement>('[data-bookmarks-context-menu]');
}

function activePage(title: string, url: string) {
	const tab = document.createElement('div');
	tab.dataset.component = 'tab';
	tab.className = 'active';
	const tabTitle = document.createElement('span');
	tabTitle.className = 'tab-title';
	tabTitle.textContent = title;
	tab.appendChild(tabTitle);
	const frameContainer = document.createElement('div');
	frameContainer.dataset.component = 'frame-container';
	const frame = document.createElement('iframe');
	frame.className = 'active';
	frame.src = `https://browser.test/frame?url=${encodeURIComponent(url)}`;
	frameContainer.appendChild(frame);
	document.body.append(tab, frameContainer);
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('BookmarksBar custom context menu', () => {
	it('awaits active-frame navigation before logging bookmark success', async () => {
		const navigation = deferred<boolean>();
		const navigateActiveFrame = vi.fn(() => navigation.promise);
		const createLog = vi.fn();
		const { root } = mount(
			[bookmark('bookmark-1', 'Example')],
			undefined,
			{ navigateActiveFrame, logger: { createLog } }
		);

		root.querySelector<HTMLElement>('[data-item-id="bookmark-1"]')!.click();

		expect(navigateActiveFrame).toHaveBeenCalledWith('https://bookmark-1.test');
		expect(createLog).not.toHaveBeenCalled();

		navigation.resolve(true);
		await navigation.promise;

		expect(createLog).toHaveBeenCalledWith('Opened bookmark: https://bookmark-1.test');
	});

	it('applies the stored visibility mode to the active URL', async () => {
		const { root, bar } = mount([], new SettingsDouble({
			bookmarksBarVisibility: 'newtab',
		}));
		await Promise.resolve();

		bar.setActiveUrl('https://example.test');
		expect(root.dataset.shown).toBe('false');

		bar.setActiveUrl('ddx://newtab/');
		expect(root.dataset.shown).toBe('true');
	});

	it('shows newtab mode for the active iframe internal newtab route', async () => {
		const { root, bar } = mount([], new SettingsDouble({
			bookmarksBarVisibility: 'newtab',
		}));
		await Promise.resolve();

		bar.setActiveUrl('/internal/newtab/');

		expect(root.dataset.shown).toBe('true');
	});

	it('does not treat an external URL with an internal newtab pathname as newtab', async () => {
		const { root, bar } = mount([], new SettingsDouble({
			bookmarksBarVisibility: 'newtab',
		}));
		await Promise.resolve();

		bar.setActiveUrl('https://example.test/internal/newtab/');
		expect(root.dataset.shown).toBe('false');
	});

	it('recognizes the internal newtab route under the configured base path', async () => {
		vi.stubGlobal('__ddxBase', '/prefix/');
		vi.resetModules();
		const { BookmarksBar: BasePathBookmarksBar } = await import('./index');
		const root = document.createElement('div');
		document.body.appendChild(root);
		const bar = new BasePathBookmarksBar({
			bookmarkManager: new BookmarkManagerDouble([]),
			navigateActiveFrame: vi.fn(),
			settings: new SettingsDouble({ bookmarksBarVisibility: 'newtab' }),
		});
		bar.init(root);
		await Promise.resolve();

		bar.setActiveUrl('/prefix/internal/newtab/');
		expect(root.dataset.shown).toBe('true');
		bar.setActiveUrl('/internal/newtab/');
		expect(root.dataset.shown).toBe('false');
	});

	it('keeps a newer visibility event when the initial settings read resolves later', async () => {
		const stored = deferred<unknown>();
		const settings = {
			getItem: vi.fn(() => stored.promise),
			setItem: vi.fn(async () => undefined),
		};
		const { root } = mount([], settings);

		document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
			detail: { visibility: 'hidden', persisted: true },
		}));
		stored.resolve('always');
		await Promise.resolve();

		expect(root.dataset.shown).toBe('false');
	});

	it('handles rejected visibility reads and event writes', async () => {
		const error = new Error('settings unavailable');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const settings = {
			getItem: vi.fn(async () => { throw error; }),
			setItem: vi.fn(async () => { throw error; }),
		};
		const { root } = mount([], settings);
		await Promise.resolve();

		document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
			detail: { visibility: 'hidden' },
		}));
		await Promise.resolve();

		expect(root.dataset.shown).toBe('false');
		expect(errorSpy).toHaveBeenCalledWith('[BookmarksBar] load visibility failed:', error);
		expect(errorSpy).toHaveBeenCalledWith('[BookmarksBar] save visibility failed:', error);
	});

	it('updates visibility and persists it when the runtime event fires', async () => {
		const settings = new SettingsDouble();
		const { root, bar } = mount([], settings);
		bar.setActiveUrl('https://example.test');

		document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
			detail: { visibility: 'newtab' },
		}));
		await Promise.resolve();
		expect(root.dataset.shown).toBe('false');
		expect(settings.setItem).toHaveBeenLastCalledWith(
			'bookmarksBarVisibility',
			'newtab',
		);

		document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
			detail: { visibility: 'always' },
		}));
		await Promise.resolve();
		expect(root.dataset.shown).toBe('true');

		document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
			detail: { visibility: 'hidden' },
		}));
		await Promise.resolve();
		expect(root.dataset.shown).toBe('false');
	});

	it('keeps the add control usable when there are no bookmarks', () => {
		const { root } = mount([]);

		expect(root.dataset.empty).toBeUndefined();
		expect(root.querySelector<HTMLElement>('.bookmarks-bar-list')!.dataset.empty).toBe('true');
		expect(root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')).not.toBeNull();
	});

	it('renders the add and overflow button icons after initialization', () => {
		const { root } = mount([]);

		expect(root.querySelector('[aria-label="Add bookmark"] svg')).not.toBeNull();
		expect(root.querySelector('[aria-label="More bookmarks"] svg')).not.toBeNull();
	});

	it('overflows the last root item when item gaps exceed the list width', () => {
		const { root, bar } = mount([
			bookmark('bookmark-1', 'First'),
			bookmark('bookmark-2', 'Second'),
			bookmark('bookmark-3', 'Third'),
		]);
		const list = root.querySelector<HTMLElement>('.bookmarks-bar-list')!;
		Object.defineProperty(list, 'clientWidth', { configurable: true, value: 99 });
		for (const item of list.children) {
			Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 32 });
		}
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ gap: '2px' } as CSSStyleDeclaration);

		(bar as any).applyOverflow();

		expect((list.children[2] as HTMLElement).dataset.overflowed).toBe('true');
		expect(root.querySelector<HTMLElement>('[aria-label="More bookmarks"]')!.dataset.shown).toBe('true');
	});

	it('reserves overflow button space after items initially exceed the list width', () => {
		const { root, bar } = mount([
			bookmark('bookmark-1', 'First'),
			bookmark('bookmark-2', 'Second'),
			bookmark('bookmark-3', 'Third'),
		]);
		const list = root.querySelector<HTMLElement>('.bookmarks-bar-list')!;
		const overflow = root.querySelector<HTMLButtonElement>('[aria-label="More bookmarks"]')!;
		Object.defineProperty(list, 'clientWidth', { configurable: true, value: 100 });
		for (const item of list.children) {
			Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 33 });
		}
		vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (
			element === list
				? { gap: '2px' } as CSSStyleDeclaration
				: element === overflow
					? { width: '24px' } as CSSStyleDeclaration
				: { gap: '4px' } as CSSStyleDeclaration
		));

		(bar as any).applyOverflow();

		expect((list.children[2] as HTMLElement).dataset.overflowed).toBe('true');
		expect(overflow.dataset.shown).toBe('true');
	});

	it('keeps all items visible when they exactly fill the list without overflow', () => {
		const { root, bar } = mount([
			bookmark('bookmark-1', 'First'),
			bookmark('bookmark-2', 'Second'),
			bookmark('bookmark-3', 'Third'),
		]);
		const list = root.querySelector<HTMLElement>('.bookmarks-bar-list')!;
		const overflow = root.querySelector<HTMLButtonElement>('[aria-label="More bookmarks"]')!;
		Object.defineProperty(list, 'clientWidth', { configurable: true, value: 100 });
		for (const item of list.children) {
			Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 32 });
		}
		vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (
			element === list
				? { gap: '2px' } as CSSStyleDeclaration
				: element === overflow
					? { width: '24px' } as CSSStyleDeclaration
					: { gap: '4px' } as CSSStyleDeclaration
		));

		(bar as any).applyOverflow();

		expect(Array.from(list.children).every((item) => (item as HTMLElement).dataset.overflowed === 'false')).toBe(true);
		expect(overflow.dataset.shown).toBe('false');
	});

	it('keeps all root items visible and the overflow button hidden when they fit', () => {
		const { root, bar } = mount([
			bookmark('bookmark-1', 'First'),
			bookmark('bookmark-2', 'Second'),
		]);
		const list = root.querySelector<HTMLElement>('.bookmarks-bar-list')!;
		const overflow = root.querySelector<HTMLButtonElement>('[aria-label="More bookmarks"]')!;
		Object.defineProperty(list, 'clientWidth', { configurable: true, value: 100 });
		for (const item of list.children) {
			Object.defineProperty(item, 'offsetWidth', { configurable: true, value: 30 });
		}
		vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (
			element === list
				? { gap: '2px' } as CSSStyleDeclaration
				: element === overflow
					? { width: '24px' } as CSSStyleDeclaration
				: { gap: '4px' } as CSSStyleDeclaration
		));

		(bar as any).applyOverflow();

		expect(Array.from(list.children).every((item) => (item as HTMLElement).dataset.overflowed === 'false')).toBe(true);
		expect(overflow.dataset.shown).toBe('false');
	});

	it('prepopulates and saves an add bookmark dialog from the active tab', async () => {
		activePage('Example page', 'https://example.test/path');
		const { root, manager } = mount([]);
		root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')!.click();

		const inputs = document.querySelectorAll<HTMLInputElement>('.bookmarks-bar-dialog .bookmarks-bar-input');
		expect(inputs[0].value).toBe('Example page');
		expect(inputs[1].value).toBe('https://example.test/path');
		document.querySelector<HTMLButtonElement>('.bookmarks-bar-dialog-btn.save')!.click();
		await Promise.resolve();

		expect(manager.createBookmark).toHaveBeenCalledWith({
			title: 'Example page',
			url: 'https://example.test/path',
		});
		expect(document.querySelector('.bookmarks-bar-dialog-overlay')).toBeNull();
	});

	it('keeps entered values in the add bookmark dialog when creation fails', async () => {
		const error = new Error('create failed');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { root, manager } = mount([]);
		manager.createBookmark.mockRejectedValueOnce(error);
		root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')!.click();

		const inputs = document.querySelectorAll<HTMLInputElement>('.bookmarks-bar-dialog .bookmarks-bar-input');
		inputs[0].value = 'Entered title';
		inputs[1].value = 'https://entered.test';
		document.querySelector<HTMLButtonElement>('.bookmarks-bar-dialog-btn.save')!.click();
		await Promise.resolve();

		expect(document.querySelector('.bookmarks-bar-dialog-overlay')).not.toBeNull();
		expect(inputs[0].value).toBe('Entered title');
		expect(inputs[1].value).toBe('https://entered.test');
		expect(errorSpy).toHaveBeenCalledWith('[BookmarksBar] createBookmark failed:', error);
	});

	it('clamps the context menu inside an 8px viewport margin', () => {
		vi.stubGlobal('innerWidth', 320);
		vi.stubGlobal('innerHeight', 240);
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			if (this.classList.contains('bookmarks-bar-context-menu')) {
				return new DOMRect(300, 220, 120, 100);
			}
			return new DOMRect();
		});
		const { root } = mount([bookmark('bookmark-1', 'Example')]);

		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!, 300, 220);

		const menu = contextMenu()!;
		expect(menu.style.left).toBe('192px');
		expect(menu.style.top).toBe('132px');
	});

	it('shows Move to Folder and Delete when a root bookmark is right-clicked', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);

		const event = rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);

		expect(event.defaultPrevented).toBe(true);
		const menu = contextMenu();
		expect(menu).not.toBeNull();
		expect(menu!.textContent).toContain('Move to Folder');
		expect(menu!.textContent).toContain('Delete');
	});

	it('excludes a folder and its nested descendant from its move picker', () => {
		const { root } = mount([
			folder('folder-1', 'Projects'),
			folder('folder-2', 'Active work', 'folder-1'),
			folder('folder-3', 'Current sprint', 'folder-2'),
			folder('folder-4', 'Archive'),
		]);

		rightClick(root.querySelector('[data-item-id="folder-1"]')!);

		const menu = contextMenu();
		expect(menu).not.toBeNull();
		(menu!.querySelector<HTMLElement>('[data-action="move-to-folder"]')!).click();

		const picker = document.querySelector<HTMLElement>('[data-bookmarks-move-picker]');
		expect(picker).not.toBeNull();
		expect(picker!.textContent).toContain('Bookmarks Bar');
		expect(picker!.textContent).not.toContain('Projects');
		expect(picker!.textContent).not.toContain('Active work');
		expect(picker!.textContent).not.toContain('Current sprint');
	});

	it('opens a themed confirmation and deletes the bookmark after confirmation', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm');
		const { root, manager } = mount([bookmark('bookmark-1', 'Example')]);

		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);

		const menu = contextMenu();
		expect(menu).not.toBeNull();
		(menu!.querySelector<HTMLElement>('[data-action="delete"]')!).click();

		const dialog = document.querySelector<HTMLElement>('.bookmarks-bar-dialog-overlay');
		expect(dialog).not.toBeNull();
		expect(dialog!.textContent).toContain('Delete bookmark');
		expect(confirmSpy).not.toHaveBeenCalled();

		dialog!.querySelector<HTMLElement>('[data-action="confirm-delete"]')!.click();
		await Promise.resolve();
		expect(manager.deleteBookmark).toHaveBeenCalledWith('bookmark-1');
	});

	it('opens a visibility submenu from the bar whitespace menu', async () => {
		const settings = new SettingsDouble({ bookmarksBarVisibility: 'newtab' });
		const { root } = mount([bookmark('bookmark-1', 'Example')], settings);
		await Promise.resolve();
		root.tabIndex = -1;
		const event = rightClick(root);

		expect(event.defaultPrevented).toBe(true);
		expect(contextMenu()!.textContent).toContain('Add Bookmark');
		expect(contextMenu()!.textContent).toContain('Add Folder');
		expect(contextMenu()!.querySelector('[data-action="visibility"]')).not.toBeNull();
		expect(contextMenu()!.querySelector('[data-action="show-newtab"]')).toBeNull();

		(contextMenu()!.querySelector<HTMLButtonElement>('[data-action="visibility"]')!).click();
		const submenu = document.querySelector<HTMLElement>('[data-bookmarks-visibility-submenu]')!;
		expect(submenu.getAttribute('role')).toBe('menu');
		const newtab = submenu.querySelector<HTMLButtonElement>('[data-action="show-newtab"]')!;
		expect(newtab.getAttribute('role')).toBe('menuitemradio');
		expect(newtab.getAttribute('aria-checked')).toBe('true');
		expect(submenu.textContent).toContain('Show Always');
		expect(submenu.textContent).toContain('Hide');

		newtab.click();
		await Promise.resolve();
		expect(settings.setItem).toHaveBeenCalledWith('bookmarksBarVisibility', 'newtab');
		expect(newtab.getAttribute('aria-checked')).toBe('true');

		rightClick(root);
		contextMenu()!.querySelector<HTMLButtonElement>('[data-action="visibility"]')!.click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(contextMenu()).toBeNull();
		expect(document.querySelector('[data-bookmarks-visibility-submenu]')).toBeNull();
		expect(document.activeElement).toBe(root);
	});

	it('keeps the visibility menus open through an owned pointerdown and closes them outside', () => {
		const { root } = mount([]);
		root.tabIndex = -1;
		rightClick(root);
		const parent = contextMenu()!;
		const visibility = parent.querySelector<HTMLButtonElement>('[data-action="visibility"]')!;

		visibility.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		visibility.click();
		const submenu = document.querySelector<HTMLElement>('[data-bookmarks-visibility-submenu]')!;
		expect(parent.isConnected).toBe(true);
		expect(submenu.isConnected).toBe(true);

		submenu.querySelector<HTMLButtonElement>('[data-action="show-always"]')!
			.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(parent.isConnected).toBe(true);
		expect(submenu.isConnected).toBe(true);

		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(contextMenu()).toBeNull();
		expect(document.querySelector('[data-bookmarks-visibility-submenu]')).toBeNull();
		expect(document.activeElement).toBe(root);
	});

	it('navigates the visibility submenu with arrow keys', () => {
		const { root } = mount([]);
		rightClick(root);
		const parent = contextMenu()!;
		const visibility = parent.querySelector<HTMLButtonElement>('[data-action="visibility"]')!;
		visibility.focus();

		visibility.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'ArrowRight',
			bubbles: true,
			cancelable: true,
		}));
		const submenu = document.querySelector<HTMLElement>('[data-bookmarks-visibility-submenu]')!;
		const actions = submenu.querySelectorAll<HTMLButtonElement>('.bookmarks-bar-context-action');
		expect(document.activeElement).toBe(actions[0]);

		for (const [key, expected] of [
			['ArrowDown', actions[1]],
			['End', actions[2]],
			['Home', actions[0]],
			['ArrowUp', actions[2]],
		] as const) {
			submenu.dispatchEvent(new KeyboardEvent('keydown', {
				key,
				bubbles: true,
				cancelable: true,
			}));
			expect(document.activeElement).toBe(expected);
		}

		submenu.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'ArrowLeft',
			bubbles: true,
			cancelable: true,
		}));
		expect(document.querySelector('[data-bookmarks-visibility-submenu]')).toBeNull();
		expect(contextMenu()).toBe(parent);
		expect(document.activeElement).toBe(visibility);
	});

	it('does not replace an item menu when a context menu event bubbles from its action', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		const menu = contextMenu()!;

		rightClick(menu.querySelector('[data-action="rename"]')!);

		expect(contextMenu()).toBe(menu);
		expect(menu.textContent).toContain('Rename');
	});

	it('creates a root folder from the whitespace menu and retains its dialog on error', async () => {
		const error = new Error('create failed');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { root, manager } = mount([]);
		manager.createFolder.mockRejectedValueOnce(error);
		rightClick(root);
		contextMenu()!.querySelector<HTMLElement>('[data-action="add-folder"]')!.click();
		const input = document.querySelector<HTMLInputElement>('.bookmarks-bar-dialog .bookmarks-bar-input')!;
		input.value = 'Projects';
		document.querySelector<HTMLButtonElement>('.bookmarks-bar-dialog-btn.save')!.click();
		await Promise.resolve();

		expect(manager.createFolder).toHaveBeenCalledWith({ title: 'Projects' });
		expect(document.querySelector('.bookmarks-bar-dialog-overlay')).not.toBeNull();
		expect(input.value).toBe('Projects');
		expect(errorSpy).toHaveBeenCalledWith('[BookmarksBar] createFolder failed:', error);
	});

	it('persists a selected visibility before announcing it from the whitespace menu', async () => {
		const settings = new SettingsDouble();
		const { root } = mount([], settings);
		const eventOrder: string[] = [];
		document.addEventListener('bookmarks-bar:visibility-change', () => eventOrder.push('event'), { once: true });
		settings.setItem.mockImplementationOnce(async () => {
			eventOrder.push('persist');
			return 'newtab';
		});
		rightClick(root);
		contextMenu()!.querySelector<HTMLButtonElement>('[data-action="visibility"]')!.click();
		const action = document.querySelector<HTMLButtonElement>(
			'[data-bookmarks-visibility-submenu] [data-action="show-newtab"]'
		)!;

		expect(action.getAttribute('role')).toBe('menuitemradio');
		expect(action.getAttribute('aria-checked')).toBe('false');
		action.click();
		await Promise.resolve();

		expect(settings.setItem).toHaveBeenCalledWith('bookmarksBarVisibility', 'newtab');
		expect(eventOrder).toEqual(['persist', 'event']);
		expect(action.getAttribute('aria-checked')).toBe('true');
	});

	it('closes the custom menu when bar whitespace is clicked', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);

		root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(contextMenu()).toBeNull();
	});

	it('closes the custom menu when Add is clicked', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);

		root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')!.click();
		expect(contextMenu()).toBeNull();
	});

	it('closes the custom menu on Escape', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(contextMenu()).toBeNull();
	});

	it('replaces the custom menu when another item is right-clicked', () => {
		const { root } = mount([
			bookmark('bookmark-1', 'First'),
			bookmark('bookmark-2', 'Second'),
		]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		const firstMenu = contextMenu();
		rightClick(root.querySelector('[data-item-id="bookmark-2"]')!);

		expect(firstMenu!.isConnected).toBe(false);
		expect(document.querySelectorAll('[data-bookmarks-context-menu]')).toHaveLength(1);
	});

	it('moves an item to the Bookmarks Bar at the existing child count', async () => {
		const { root, manager } = mount([
			folder('folder-1', 'Folder'),
			bookmark('bookmark-1', 'Example'),
		]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		const menu = contextMenu()!;
		menu.querySelector<HTMLElement>('[data-action="move-to-folder"]')!.click();
		document.querySelector<HTMLElement>('[data-bookmarks-move-picker]')!
			.querySelectorAll<HTMLButtonElement>('button')[0].click();
		await Promise.resolve();

		expect(manager.moveItem).toHaveBeenCalledWith({
			itemId: 'bookmark-1',
			newParentId: undefined,
			newIndex: 2,
		});
	});

	it('deletes a folder and its contents after confirmation', async () => {
		const { root, manager } = mount([folder('folder-1', 'Projects')]);
		rightClick(root.querySelector('[data-item-id="folder-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="delete"]')!.click();
		document.querySelector<HTMLElement>('[data-action="confirm-delete"]')!.click();
		await Promise.resolve();

		expect(manager.deleteFolder).toHaveBeenCalledWith('folder-1', true);
	});

	it('renames bookmarks and folders through their manager methods', async () => {
		const { root, manager } = mount([
			bookmark('bookmark-1', 'Example'),
			folder('folder-1', 'Projects'),
		]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
		const bookmarkInput = document.querySelector<HTMLInputElement>('.bookmarks-bar-input')!;
		bookmarkInput.value = 'Renamed bookmark';
		document.querySelector<HTMLElement>('[data-action="confirm"]')!.click();
		await Promise.resolve();

		rightClick(root.querySelector('[data-item-id="folder-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
		const folderInput = document.querySelector<HTMLInputElement>('.bookmarks-bar-input')!;
		folderInput.value = 'Renamed folder';
		document.querySelector<HTMLElement>('[data-action="confirm"]')!.click();
		await Promise.resolve();

		expect(manager.updateBookmark).toHaveBeenCalledWith('bookmark-1', { title: 'Renamed bookmark' });
		expect(manager.updateFolder).toHaveBeenCalledWith('folder-1', { title: 'Renamed folder' });
	});

	it('removes the Add Bookmark Escape listener when cancelled', () => {
		const removeListener = vi.spyOn(document, 'removeEventListener');
		const { root } = mount([]);
		root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')!.click();
		removeListener.mockClear();

		document.querySelector<HTMLButtonElement>('.bookmarks-bar-dialog-btn.cancel')!.click();
		expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
	});

	it('removes an open dialog and its Escape listener when destroyed', () => {
		const removeListener = vi.spyOn(document, 'removeEventListener');
		const { root, bar } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
		removeListener.mockClear();

		bar.destroy();

		expect(document.querySelector('.bookmarks-bar-dialog-overlay')).toBeNull();
		expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
	});

	it('does not handle context menus from its retained root after destruction', () => {
		const { root, bar } = mount([bookmark('bookmark-1', 'Example')]);
		bar.destroy();

		const event = rightClick(root);

		expect(event.defaultPrevented).toBe(false);
		expect(contextMenu()).toBeNull();
		expect(document.querySelector('.bookmarks-bar-dialog-overlay')).toBeNull();
	});

	it('removes retained bookmark items on destruction', () => {
		const { root, bar } = mount([bookmark('bookmark-1', 'Example')]);
		const item = root.querySelector<HTMLElement>('[data-item-id="bookmark-1"]')!;
		const navigateActiveFrame = (bar as any).deps.navigateActiveFrame as ReturnType<typeof vi.fn>;

		bar.destroy();
		item.click();
		const event = rightClick(item);

		expect(navigateActiveFrame).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
		expect(contextMenu()).toBeNull();
	});

	it('removes every open overlay on destruction and ignores later Escape presses', () => {
		const { root, bar } = mount([bookmark('bookmark-1', 'Example')]);
		root.querySelector<HTMLButtonElement>('[aria-label="Add bookmark"]')!.click();
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
		expect(document.querySelectorAll('.bookmarks-bar-dialog-overlay')).toHaveLength(2);

		bar.destroy();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

		expect(document.querySelectorAll('.bookmarks-bar-dialog-overlay')).toHaveLength(0);
	});

	it('focuses the replacement bookmark after a synchronous rename rerender', async () => {
		const { root, manager } = mount([bookmark('bookmark-1', 'Example')]);
		manager.updateBookmark.mockImplementation(async () => {
			manager.emit();
			return null;
		});
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
		document.querySelector<HTMLInputElement>('.bookmarks-bar-input')!.value = 'Renamed';
		document.querySelector<HTMLElement>('[data-action="confirm"]')!.click();
		await Promise.resolve();

		expect(document.activeElement).toBe(root.querySelector('[data-item-id="bookmark-1"]'));
	});

	it('focuses the replacement bookmark after a synchronous move rerender', async () => {
		const { root, manager } = mount([bookmark('bookmark-1', 'Example')]);
		manager.moveItem.mockImplementation(async () => {
			manager.emit();
			return true;
		});
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		contextMenu()!.querySelector<HTMLElement>('[data-action="move-to-folder"]')!.click();
		document.querySelector<HTMLButtonElement>('[data-bookmarks-move-picker] button')!.click();
		await Promise.resolve();

		expect(document.activeElement).toBe(root.querySelector('[data-item-id="bookmark-1"]'));
	});

	it('wraps context-menu keyboard navigation across enabled actions', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		rightClick(root.querySelector('[data-item-id="bookmark-1"]')!);
		const menu = contextMenu()!;
		const actions = menu.querySelectorAll<HTMLButtonElement>('.bookmarks-bar-context-action');
		actions[1].disabled = true;

		for (const [key, expected] of [
			['ArrowDown', actions[2]],
			['ArrowUp', actions[0]],
			['End', actions[3]],
			['ArrowDown', actions[0]],
			['Home', actions[0]],
			['ArrowUp', actions[3]],
		] as const) {
			const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
			menu.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			expect(document.activeElement).toBe(expected);
		}
	});

	it('gives the context menu menu semantics and restores focus to its trigger', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		const trigger = root.querySelector<HTMLElement>('[data-item-id="bookmark-1"]')!;
		trigger.focus();
		rightClick(trigger);

		const menu = contextMenu()!;
		expect(menu.getAttribute('role')).toBe('menu');
		expect(menu.querySelector('[role="menuitem"]')).not.toBeNull();
		expect(document.activeElement).toBe(menu.querySelector('[role="menuitem"]'));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(document.activeElement).toBe(trigger);
	});

	it('gives rename dialogs modal semantics and restores focus to their trigger', () => {
		const { root } = mount([bookmark('bookmark-1', 'Example')]);
		const trigger = root.querySelector<HTMLElement>('[data-item-id="bookmark-1"]')!;
		trigger.focus();
		rightClick(trigger);
		contextMenu()!.querySelector<HTMLElement>('[data-action="rename"]')!.click();

		const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		const heading = dialog.querySelector<HTMLElement>('.bookmarks-bar-dialog-title')!;
		const input = dialog.querySelector<HTMLInputElement>('.bookmarks-bar-input')!;
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
		expect(document.activeElement).toBe(input);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(document.activeElement).toBe(trigger);
	});
});
