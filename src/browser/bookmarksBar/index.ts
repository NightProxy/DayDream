import {
	createIcons,
	ChevronDown,
	ChevronRight,
	ChevronsRight,
	Folder,
	Globe,
	Plus,
} from 'lucide';
import { isFolder, type BookmarkItem } from '../../apis/bookmarks';
import { resolvePath } from '@utils/basepath';

export type BookmarksBarVisibility = 'always' | 'newtab' | 'hidden';

interface BookmarksBarSettings {
	getItem: (key: string) => Promise<unknown>;
	setItem: (key: string, value: BookmarksBarVisibility) => Promise<unknown>;
}

export interface BookmarksBarDeps {
	/** Shared BookmarkManager instance (src/apis/bookmarks.ts). */
	bookmarkManager: any;
	/** Navigates the active browser frame. */
	navigateActiveFrame: (url: string) => Promise<boolean>;
	settings?: BookmarksBarSettings;
	logger?: { createLog?: (msg: string) => void };
}

/**
 * Chrome-style bookmarks bar.
 *
 * Renders root-level bookmarks and folders as a single horizontal strip under
 * the utility bar. Folders open click-to-expand dropdowns (nested folders are
 * supported recursively). Items that do not fit collapse into an overflow
 * chevron on the right.
 *
 * Rendering is driven entirely by BookmarkManager. `addListener` fires on every
 * create/update/delete/move, so the bar re-renders itself without any caller
 * needing to poke it.
 */
export class BookmarksBar {
	private deps: BookmarksBarDeps;
	private root: HTMLElement | null = null;
	private list: HTMLElement | null = null;
	private overflowBtn: HTMLButtonElement | null = null;
	private unsubscribe: (() => void) | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private openMenus: HTMLElement[] = [];
	private outsideHandler: ((e: Event) => void) | null = null;
	private reflowHandle: number | null = null;
	private contextMenu: HTMLElement | null = null;
	private contextSubmenu: HTMLElement | null = null;
	private contextMenuTrigger: HTMLElement | null = null;
	private addBtn: HTMLButtonElement | null = null;
	private active = false;
	private generation = 0;
	private visibility: BookmarksBarVisibility = 'always';
	private visibilityRequest = 0;
	private activeUrl = '';
	private readonly dialogClosers = new Set<() => void>();
	private dialogId = 0;
	private readonly preventContextMenu = (event: Event) => event.preventDefault();
	private readonly openOverflow = (event: MouseEvent) => {
		event.stopPropagation();
		this.openOverflowMenu();
	};
	private readonly openAddDialog = (event: MouseEvent) => {
		event.stopPropagation();
		this.closeMenus();
		if (this.addBtn) this.showAddDialog(this.addBtn);
	};
	private readonly handleVisibilityChange = (event: Event) => {
		const detail = (event as CustomEvent<{
			visibility?: unknown;
			persisted?: boolean;
		}>).detail;
		const visibility = detail?.visibility;
		if (!this.isVisibility(visibility)) return;
		this.visibilityRequest++;
		this.visibility = visibility;
		this.applyVisibility();
		if (!detail?.persisted) {
			void Promise.resolve(this.deps.settings?.setItem(
				'bookmarksBarVisibility',
				visibility
			)).catch((error) => {
				console.error('[BookmarksBar] save visibility failed:', error);
			});
		}
	};
	private readonly openRootContextMenu = (event: MouseEvent) => {
		if (!this.active || !this.root) return;
		const target = event.target as Element | null;
		if (
			!target ||
			target.closest('button, [role="menu"], .bookmarks-bar-menu')
		) return;
		this.openRootContextMenuAt(event);
	};

	constructor(deps: BookmarksBarDeps) {
		this.deps = deps;
	}

	init(root: HTMLElement | null) {
		if (!root) {
			console.warn('[BookmarksBar] container missing; bar disabled');
			return;
		}
		this.root = root;
		this.active = true;
		this.generation++;
		this.root.addEventListener('contextmenu', this.preventContextMenu);
		this.root.addEventListener('contextmenu', this.openRootContextMenu);
		document.addEventListener(
			'bookmarks-bar:visibility-change',
			this.handleVisibilityChange
		);
		this.applyVisibility();
		void this.loadVisibility();

		this.list = document.createElement('div');
		this.list.className = 'bookmarks-bar-list';
		this.root.appendChild(this.list);

		this.overflowBtn = document.createElement('button');
		this.overflowBtn.className = 'bookmarks-bar-overflow';
		this.overflowBtn.setAttribute('aria-label', 'More bookmarks');
		this.overflowBtn.dataset.shown = 'false';
		this.overflowBtn.appendChild(this.icon('chevrons-right'));
		this.overflowBtn.addEventListener('click', this.openOverflow);
		this.root.appendChild(this.overflowBtn);

		// "Add bookmark" button at far right.
		this.addBtn = document.createElement('button');
		this.addBtn.className = 'bookmarks-bar-add';
		this.addBtn.setAttribute('aria-label', 'Add bookmark');
		this.addBtn.title = 'Add bookmark';
		this.addBtn.appendChild(this.icon('plus'));
		this.addBtn.addEventListener('click', this.openAddDialog);
		this.root.appendChild(this.addBtn);

		// Re-render on any bookmark mutation.
		if (typeof this.deps.bookmarkManager?.addListener === 'function') {
			this.unsubscribe = this.deps.bookmarkManager.addListener(() =>
				this.render()
			);
		}

		// Overflow depends on available width, so recompute on resize.
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() =>
				this.scheduleReflow()
			);
			this.resizeObserver.observe(this.root);
		}

		this.render();
	}

	private showAddDialog(trigger: HTMLElement | null) {
		const activeFrame = document.querySelector(
			'div[data-component="frame-container"] iframe.active'
		) as HTMLIFrameElement | null;
		const url = activeFrame?.src ? this.decodeUrl(activeFrame.src) : '';
		const titleEl = document.querySelector(
			'[data-component="tab"].active .tab-title'
		) as HTMLElement | null;
		const title = titleEl?.textContent?.trim() ?? '';

		const { overlay, dialog, close } = this.createOverlay('Add bookmark', trigger);

		const mkInput = (id: string, label: string, val: string) => {
			const wrap = document.createElement('div');
			wrap.className = 'bookmarks-bar-field';
			const lbl = document.createElement('label');
			lbl.htmlFor = id;
			lbl.textContent = label;
			const inp = document.createElement('input');
			inp.type = 'text';
			inp.id = id;
			inp.value = val;
			inp.className = 'bookmarks-bar-input';
			wrap.appendChild(lbl);
			wrap.appendChild(inp);
			return { wrap, inp };
		};

		const { wrap: titleWrap, inp: titleInp } = mkInput('bb-title', 'Name', title);
		const { wrap: urlWrap, inp: urlInp } = mkInput('bb-url', 'URL', url);

		const actions = document.createElement('div');
		actions.className = 'bookmarks-bar-dialog-actions';

		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'bookmarks-bar-dialog-btn cancel';
		cancelBtn.textContent = 'Cancel';
		cancelBtn.addEventListener('click', close);

		const saveBtn = document.createElement('button');
		saveBtn.className = 'bookmarks-bar-dialog-btn save';
		saveBtn.textContent = 'Save';
		saveBtn.addEventListener('click', async () => {
			const t = titleInp.value.trim();
			const u = urlInp.value.trim();
			if (!t || !u) return;
			try {
				await this.deps.bookmarkManager?.createBookmark?.({ title: t, url: u });
				close();
			} catch (err) {
				console.error('[BookmarksBar] createBookmark failed:', err);
			}
		});

		actions.appendChild(cancelBtn);
		actions.appendChild(saveBtn);

		dialog.appendChild(titleWrap);
		dialog.appendChild(urlWrap);
		dialog.appendChild(actions);
		overlay.appendChild(dialog);
		document.body.appendChild(overlay);

		titleInp.focus();
	}

	private decodeUrl(src: string): string {
		try {
			const u = new URL(src);
			const wrapped = u.searchParams.get('url');
			if (wrapped) return wrapped;
		} catch { /* not a URL */ }
		return src;
	}

	destroy() {
		this.active = false;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.closeMenus();
		for (const close of [...this.dialogClosers]) close();
		this.root?.removeEventListener('contextmenu', this.preventContextMenu);
		this.root?.removeEventListener('contextmenu', this.openRootContextMenu);
		document.removeEventListener(
			'bookmarks-bar:visibility-change',
			this.handleVisibilityChange
		);
		this.overflowBtn?.removeEventListener('click', this.openOverflow);
		this.addBtn?.removeEventListener('click', this.openAddDialog);
		if (this.reflowHandle !== null) {
			cancelAnimationFrame(this.reflowHandle);
			this.reflowHandle = null;
		}
		this.list?.remove();
		this.overflowBtn?.remove();
		this.addBtn?.remove();
		this.list = null;
		this.overflowBtn = null;
		this.addBtn = null;
	}

	/** Show/hide the whole strip. */
	setVisible(visible: boolean) {
		if (!this.root) return;
		this.root.dataset.shown = visible ? 'true' : 'false';
		if (!visible) this.closeMenus();
	}

	setActiveUrl(url: string) {
		this.activeUrl = url;
		this.applyVisibility();
	}

	toggle() {
		if (!this.root) return;
		this.setVisible(this.root.dataset.shown === 'false');
	}

	private async loadVisibility() {
		const request = ++this.visibilityRequest;
		let visibility: unknown;
		try {
			visibility = await this.deps.settings?.getItem('bookmarksBarVisibility');
		} catch (error) {
			console.error('[BookmarksBar] load visibility failed:', error);
			return;
		}
		if (!this.active || request !== this.visibilityRequest) return;
		if (!this.isVisibility(visibility)) return;
		this.visibility = visibility;
		this.applyVisibility();
	}

	private isVisibility(value: unknown): value is BookmarksBarVisibility {
		return value === 'always' || value === 'newtab' || value === 'hidden';
	}

	private applyVisibility() {
		this.setVisible(
			this.visibility === 'always' ||
				(this.visibility === 'newtab' && this.isNewtabUrl(this.activeUrl))
		);
	}

	private isNewtabUrl(url: string) {
		try {
			const parsed = new URL(url, window.location.origin);
			if (
				parsed.protocol === 'ddx:' &&
				parsed.hostname === 'newtab' &&
				(parsed.pathname === '' || parsed.pathname === '/')
			) return true;

			const internalNewtab = new URL(
				resolvePath('internal/newtab'),
				window.location.origin
			);
			return (
				parsed.origin === internalNewtab.origin &&
				parsed.pathname.replace(/\/+$/, '') ===
					internalNewtab.pathname.replace(/\/+$/, '')
			);
		} catch {
			return false;
		}
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	render() {
		if (!this.list || !this.root) return;
		this.closeMenus();
		this.list.replaceChildren();

		const items = this.rootItems();

		// Keep the controls available while hiding an empty bookmark list.
		delete this.root.dataset.empty;
		this.list.dataset.empty = items.length === 0 ? 'true' : 'false';
		if (items.length === 0 && this.overflowBtn) {
			this.overflowBtn.dataset.shown = 'false';
		}
		for (const item of items) {
			this.list.appendChild(this.buildBarItem(item));
		}

		this.refreshIcons(this.root);
		this.scheduleReflow();
	}

	private rootItems(): BookmarkItem[] {
		const bm = this.deps.bookmarkManager;
		try {
			if (typeof bm?.getItemsByParent === 'function') {
				return bm.getItemsByParent(undefined) ?? [];
			}
			// Fallback for managers without the parent query.
			const marks = (bm?.getBookmarks?.() ?? []).filter(
				(b: any) => !b.parentId
			);
			const folders = (bm?.getFolders?.() ?? []).filter(
				(f: any) => !f.parentId
			);
			return [...folders, ...marks];
		} catch (error) {
			console.error('[BookmarksBar] failed to read bookmarks:', error);
			return [];
		}
	}

	private childrenOf(parentId: string): BookmarkItem[] {
		const bm = this.deps.bookmarkManager;
		try {
			return bm?.getItemsByParent?.(parentId) ?? [];
		} catch (error) {
			console.error('[BookmarksBar] failed to read folder:', error);
			return [];
		}
	}

	private buildBarItem(item: BookmarkItem): HTMLElement {
		const folder = isFolder(item);
		const el = document.createElement('button');
		el.className = 'bookmarks-bar-item';
		el.dataset.kind = folder ? 'folder' : 'bookmark';
		el.dataset.itemId = item.id;
		el.title = folder ? item.title : `${item.title}\n${(item as any).url}`;

		el.appendChild(
			folder
				? this.icon('folder')
				: this.favicon((item as any).url)
		);

		const label = document.createElement('span');
		label.className = 'bookmarks-bar-label';
		label.textContent = item.title || 'Untitled';
		el.appendChild(label);

		if (folder) el.appendChild(this.icon('chevron-down', 'caret'));
		const generation = this.generation;

		el.addEventListener('click', (e) => {
			if (!this.active || generation !== this.generation) return;
			e.stopPropagation();
			if (folder) {
				const already = this.openMenus.length > 0 &&
					this.openMenus[0].dataset.ownerId === item.id;
				this.closeMenus();
				if (!already) this.openFolderMenu(item.id, el);
			} else {
				this.openUrl((item as any).url);
			}
		});
		el.addEventListener('contextmenu', (e) => {
			if (this.active && generation === this.generation) this.openContextMenu(e, item);
		});

		return el;
	}

	// ── Overflow ─────────────────────────────────────────────────────────────

	private scheduleReflow() {
		if (this.reflowHandle !== null) return;
		this.reflowHandle = requestAnimationFrame(() => {
			this.reflowHandle = null;
			this.applyOverflow();
		});
	}

	/**
	 * Hides items that extend past the strip's right edge and reveals the
	 * overflow chevron when anything was hidden. Measured against the list's
	 * client width so it stays correct across sidebar/window resizes.
	 */
	private applyOverflow() {
		if (!this.list || !this.overflowBtn) return;

		const children = Array.from(this.list.children) as HTMLElement[];
		for (const child of children) child.dataset.overflowed = 'false';
		this.overflowBtn.dataset.shown = 'false';

		const available = this.list.clientWidth;
		if (available <= 0) return;

		const gapValue = getComputedStyle(this.list).gap.trim();
		const gapMatch = /^(\d+(?:\.\d+)?)px$/.exec(gapValue);
		const gap = gapMatch ? Number.parseFloat(gapMatch[1]) : 0;

		let used = 0;
		let hidden = false;
		for (const [index, child] of children.entries()) {
			used += child.offsetWidth + (index > 0 ? gap : 0);
			if (used > available) {
				child.dataset.overflowed = 'true';
				hidden = true;
			}
		}

		if (!hidden) return;

		const overflowWidth = Number.parseFloat(getComputedStyle(this.overflowBtn).width);
		const reservedOverflowWidth = Number.isFinite(overflowWidth) ? overflowWidth : 0;
		const parent = this.list.parentElement;
		const parentGapValue = parent ? getComputedStyle(parent).gap.trim() : '';
		const parentGapMatch = /^(\d+(?:\.\d+)?)px$/.exec(parentGapValue);
		const parentGap = parentGapMatch ? Number.parseFloat(parentGapMatch[1]) : 0;
		const availableWithOverflow = available - reservedOverflowWidth - parentGap;
		used = 0;
		hidden = false;
		for (const [index, child] of children.entries()) {
			child.dataset.overflowed = 'false';
			used += child.offsetWidth + (index > 0 ? gap : 0);
			if (used > availableWithOverflow) {
				child.dataset.overflowed = 'true';
				hidden = true;
			}
		}

		this.overflowBtn.dataset.shown = hidden ? 'true' : 'false';
	}

	private openOverflowMenu() {
		if (!this.list || !this.overflowBtn) return;
		const hidden = (
			Array.from(this.list.children) as HTMLElement[]
		).filter((c) => c.dataset.overflowed === 'true');

		const items = hidden
			.map((c) => c.dataset.itemId)
			.filter((id): id is string => !!id)
			.map((id) => this.deps.bookmarkManager?.getItemById?.(id))
			.filter(Boolean) as BookmarkItem[];

		const wasOpen =
			this.openMenus.length > 0 &&
			this.openMenus[0].dataset.ownerId === '__overflow__';
		this.closeMenus();
		if (wasOpen || items.length === 0) return;

		this.showMenu(items, this.overflowBtn, '__overflow__');
	}

	// ── Dropdowns ────────────────────────────────────────────────────────────

	private openFolderMenu(folderId: string, anchor: HTMLElement) {
		const items = this.childrenOf(folderId);
		this.showMenu(items, anchor, folderId);
	}

	private showMenu(
		items: BookmarkItem[],
		anchor: HTMLElement,
		ownerId: string
	) {
		if (!this.root) return;

		const menu = document.createElement('div');
		menu.className = 'bookmarks-bar-menu';
		menu.dataset.ownerId = ownerId;

		if (items.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'bookmarks-bar-menu-empty';
			empty.textContent = '(empty)';
			menu.appendChild(empty);
		} else {
			for (const item of items) {
				menu.appendChild(this.buildMenuRow(item));
			}
		}

		// Appended inside the bar so shadow-root styles apply; positioned fixed
		// so it escapes the strip's bounds.
		this.root.appendChild(menu);
		this.positionMenu(menu, anchor);
		this.refreshIcons(menu);
		this.openMenus.push(menu);
		this.bindOutsideClose();
	}

	private buildMenuRow(item: BookmarkItem): HTMLElement {
		const folder = isFolder(item);
		const row = document.createElement('button');
		row.className = 'bookmarks-bar-menu-item';
		row.dataset.kind = folder ? 'folder' : 'bookmark';
		row.dataset.itemId = item.id;
		row.title = folder ? item.title : `${item.title}\n${(item as any).url}`;

		row.appendChild(
			folder ? this.icon('folder') : this.favicon((item as any).url)
		);

		const label = document.createElement('span');
		label.className = 'bookmarks-bar-label';
		label.textContent = item.title || 'Untitled';
		row.appendChild(label);

		if (folder) row.appendChild(this.icon('chevron-right', 'caret'));
		const generation = this.generation;

		row.addEventListener('click', (e) => {
			if (!this.active || generation !== this.generation) return;
			e.stopPropagation();
			if (folder) {
				// Nested folder: drop any deeper menus, then open this one.
				const depth = this.openMenus.findIndex((m) =>
					m.contains(row)
				);
				if (depth >= 0) this.closeMenusFrom(depth + 1);
				this.openFolderMenu(item.id, row);
			} else {
				this.openUrl((item as any).url);
			}
		});
		row.addEventListener('contextmenu', (e) => {
			if (this.active && generation === this.generation) this.openContextMenu(e, item);
		});

		return row;
	}

	private positionMenu(menu: HTMLElement, anchor: HTMLElement) {
		const a = anchor.getBoundingClientRect();
		const nested = anchor.classList.contains('bookmarks-bar-menu-item');

		// Nested menus fly out to the right of their row; top-level menus drop
		// below the bar item.
		let left = nested ? a.right + 2 : a.left;
		let top = nested ? a.top : a.bottom + 4;

		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;

		// Flip back inside the viewport if we would overflow.
		const m = menu.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		if (m.right > vw - 8) {
			left = nested
				? Math.max(8, a.left - m.width - 2)
				: Math.max(8, vw - m.width - 8);
			menu.style.left = `${left}px`;
		}
		if (m.bottom > vh - 8) {
			menu.style.top = `${Math.max(8, vh - m.height - 8)}px`;
		}
	}

	private bindOutsideClose() {
		if (this.outsideHandler) return;
		this.outsideHandler = (e: Event) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (
				this.contextMenu?.contains(target) ||
				this.contextSubmenu?.contains(target) ||
				this.openMenus.some((menu) => menu.contains(target))
			) return;
			this.closeMenus();
		};
		// Capture phase so iframe-adjacent clicks still dismiss.
		document.addEventListener('pointerdown', this.outsideHandler, true);
		document.addEventListener('keydown', this.escHandler, true);
	}

	private escHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') this.closeMenus();
	};

	private closeMenusFrom(index: number) {
		const removed = this.openMenus.splice(index);
		for (const menu of removed) menu.remove();
		if (this.openMenus.length === 0) this.unbindOutsideClose();
	}

	private closeMenus() {
		this.closeMenusFrom(0);
		this.closeContextMenu();
	}

	private unbindOutsideClose() {
		if (this.outsideHandler) {
			document.removeEventListener(
				'pointerdown',
				this.outsideHandler,
				true
			);
			this.outsideHandler = null;
		}
		document.removeEventListener('keydown', this.escHandler, true);
	}

	// ── Context menu ─────────────────────────────────────────────────────────

	private openContextMenu(event: MouseEvent, item: BookmarkItem) {
		event.preventDefault();
		event.stopPropagation();
		this.closeMenus();

		const menu = document.createElement('div');
		menu.className = 'bookmarks-bar-context-menu';
		menu.dataset.bookmarksContextMenu = '';
		menu.setAttribute('role', 'menu');
		menu.style.position = 'fixed';
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;

		if (!isFolder(item)) {
			this.contextAction(menu, 'open', 'Open', () => this.openUrl((item as any).url));
		}
		this.contextAction(menu, 'rename', 'Rename', (trigger) => this.showRenameDialog(item, trigger));
		this.contextAction(menu, 'move-to-folder', 'Move to Folder', (trigger) => this.showMovePicker(item, trigger));
		this.contextAction(
			menu,
			'delete',
			isFolder(item) ? 'Delete Folder' : 'Delete',
			(trigger) => this.showDeleteDialog(item, trigger)
		);

		document.body.appendChild(menu);
		const bounds = menu.getBoundingClientRect();
		const margin = 8;
		menu.style.left = `${Math.min(
			Math.max(margin, event.clientX),
			Math.max(margin, window.innerWidth - bounds.width - margin)
		)}px`;
		menu.style.top = `${Math.min(
			Math.max(margin, event.clientY),
			Math.max(margin, window.innerHeight - bounds.height - margin)
		)}px`;
		this.contextMenu = menu;
		this.contextMenuTrigger = event.currentTarget as HTMLElement;
		this.bindOutsideClose();
		menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
		menu.addEventListener('keydown', (keyboardEvent) => {
			this.moveContextMenuFocus(menu, keyboardEvent);
		});
	}

	private openRootContextMenuAt(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.closeMenus();

		const menu = document.createElement('div');
		menu.className = 'bookmarks-bar-context-menu';
		menu.dataset.bookmarksContextMenu = '';
		menu.setAttribute('role', 'menu');
		menu.style.position = 'fixed';
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;

		const trigger = this.root;
		this.contextAction(menu, 'add-bookmark', 'Add Bookmark', () =>
			this.showAddDialog(trigger)
		);
		this.contextAction(menu, 'add-folder', 'Add Folder', () =>
			this.showAddFolderDialog(trigger)
		);
		const visibility = document.createElement('button');
		visibility.type = 'button';
		visibility.className = 'bookmarks-bar-context-action';
		visibility.dataset.action = 'visibility';
		visibility.setAttribute('role', 'menuitem');
		visibility.setAttribute('aria-haspopup', 'menu');
		visibility.setAttribute('aria-expanded', 'false');
		visibility.textContent = 'Visibility';
		visibility.addEventListener('click', (clickEvent) => {
			clickEvent.stopPropagation();
			if (this.contextSubmenu) {
				this.closeVisibilitySubmenu();
				return;
			}
			this.openVisibilitySubmenu(visibility);
		});
		menu.appendChild(visibility);
		menu.addEventListener('keydown', (keyboardEvent) => {
			if (
				keyboardEvent.key === 'ArrowRight' &&
				document.activeElement === visibility
			) {
				keyboardEvent.preventDefault();
				if (!this.contextSubmenu) this.openVisibilitySubmenu(visibility);
				return;
			}
			this.moveContextMenuFocus(menu, keyboardEvent);
		});

		document.body.appendChild(menu);
		this.positionContextMenu(menu, event);
		this.contextMenu = menu;
		this.contextMenuTrigger = trigger;
		this.bindOutsideClose();
		menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
	}

	private positionContextMenu(menu: HTMLElement, event: MouseEvent) {
		const bounds = menu.getBoundingClientRect();
		const margin = 8;
		menu.style.left = `${Math.min(
			Math.max(margin, event.clientX),
			Math.max(margin, window.innerWidth - bounds.width - margin)
		)}px`;
		menu.style.top = `${Math.min(
			Math.max(margin, event.clientY),
			Math.max(margin, window.innerHeight - bounds.height - margin)
		)}px`;
	}

	private openVisibilitySubmenu(anchor: HTMLElement) {
		const submenu = document.createElement('div');
		submenu.className = 'bookmarks-bar-context-menu bookmarks-bar-visibility-submenu';
		submenu.dataset.bookmarksVisibilitySubmenu = '';
		submenu.setAttribute('role', 'menu');
		this.contextAction(submenu, 'show-newtab', 'Show on New Tab', () => {
			void this.setVisibilityFromMenu('newtab', submenu);
		}, 'menuitemradio', this.visibility === 'newtab');
		this.contextAction(submenu, 'show-always', 'Show Always', () => {
			void this.setVisibilityFromMenu('always', submenu);
		}, 'menuitemradio', this.visibility === 'always');
		this.contextAction(submenu, 'hide', 'Hide', () => {
			void this.setVisibilityFromMenu('hidden', submenu);
		}, 'menuitemradio', this.visibility === 'hidden');

		document.body.appendChild(submenu);
		const anchorBounds = anchor.getBoundingClientRect();
		const bounds = submenu.getBoundingClientRect();
		const margin = 8;
		submenu.style.left = `${Math.min(
			Math.max(margin, anchorBounds.right + 4),
			Math.max(margin, window.innerWidth - bounds.width - margin)
		)}px`;
		submenu.style.top = `${Math.min(
			Math.max(margin, anchorBounds.top),
			Math.max(margin, window.innerHeight - bounds.height - margin)
		)}px`;
		this.contextSubmenu = submenu;
		anchor.setAttribute('aria-expanded', 'true');
		submenu.querySelector<HTMLButtonElement>('button')?.focus();
		submenu.addEventListener('keydown', (keyboardEvent) => {
			if (keyboardEvent.key === 'ArrowLeft') {
				keyboardEvent.preventDefault();
				this.closeVisibilitySubmenu(true);
				return;
			}
			this.moveContextMenuFocus(submenu, keyboardEvent);
		});
	}

	private closeVisibilitySubmenu(restoreFocus = false) {
		const anchor = this.contextMenu?.querySelector<HTMLButtonElement>(
			'[data-action="visibility"]'
		);
		this.contextSubmenu?.remove();
		this.contextSubmenu = null;
		anchor?.setAttribute('aria-expanded', 'false');
		if (restoreFocus) anchor?.focus();
	}

	private moveContextMenuFocus(menu: HTMLElement, keyboardEvent: KeyboardEvent) {
		if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(keyboardEvent.key)) return;
		keyboardEvent.preventDefault();
		const actions = Array.from(
			menu.querySelectorAll<HTMLButtonElement>(
				'.bookmarks-bar-context-action:not(:disabled)'
			)
		);
		if (actions.length === 0) return;
		const current = actions.indexOf(document.activeElement as HTMLButtonElement);
		let next = current;
		if (keyboardEvent.key === 'Home') next = 0;
		if (keyboardEvent.key === 'End') next = actions.length - 1;
		if (keyboardEvent.key === 'ArrowDown') next = (current + 1 + actions.length) % actions.length;
		if (keyboardEvent.key === 'ArrowUp') next = (current - 1 + actions.length) % actions.length;
		actions[next].focus();
	}

	private contextAction(
		menu: HTMLElement,
		action: string,
		label: string,
		handler: (trigger: HTMLElement | null) => void,
		role = 'menuitem',
		checked?: boolean
	) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'bookmarks-bar-context-action';
		button.dataset.action = action;
		button.setAttribute('role', role);
		if (checked !== undefined) button.setAttribute('aria-checked', String(checked));
		button.textContent = label;
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			const trigger = this.contextMenuTrigger;
			this.closeContextMenu(false);
			handler(trigger);
		});
		menu.appendChild(button);
	}

	private closeContextMenu(restoreFocus = true) {
		this.closeVisibilitySubmenu();
		this.contextMenu?.remove();
		this.contextMenu = null;
		const trigger = this.contextMenuTrigger;
		this.contextMenuTrigger = null;
		if (this.openMenus.length === 0) this.unbindOutsideClose();
		if (restoreFocus && trigger?.isConnected) trigger.focus();
	}

	private showRenameDialog(item: BookmarkItem, trigger: HTMLElement | null) {
		const { overlay, dialog, close } = this.createOverlay('Rename', trigger);
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'bookmarks-bar-input';
		input.value = item.title;
		dialog.appendChild(input);
		this.dialogActions(dialog, close, 'Save', async () => {
			const title = input.value.trim();
			if (!title) return;
			await (isFolder(item)
				? this.deps.bookmarkManager?.updateFolder?.(item.id, { title })
				: this.deps.bookmarkManager?.updateBookmark?.(item.id, { title }));
			close();
			this.focusItem(item.id);
		});
		document.body.appendChild(overlay);
		input.focus();
	}

	private showAddFolderDialog(trigger: HTMLElement | null) {
		const { overlay, dialog, close } = this.createOverlay('Add folder', trigger);
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'bookmarks-bar-input';
		dialog.appendChild(input);
		this.dialogActions(dialog, close, 'Save', async () => {
			const title = input.value.trim();
			if (!title) return;
			try {
				await this.deps.bookmarkManager?.createFolder?.({ title });
				close();
			} catch (error) {
				console.error('[BookmarksBar] createFolder failed:', error);
			}
		});
		document.body.appendChild(overlay);
		input.focus();
	}

	private async setVisibilityFromMenu(
		visibility: BookmarksBarVisibility,
		menu: HTMLElement
	) {
		try {
			await this.deps.settings?.setItem('bookmarksBarVisibility', visibility);
			this.visibility = visibility;
			this.applyVisibility();
			for (const option of menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) {
				option.setAttribute(
					'aria-checked',
					String(option.dataset.action === (visibility === 'hidden' ? 'hide' : `show-${visibility}`))
				);
			}
			document.dispatchEvent(new CustomEvent('bookmarks-bar:visibility-change', {
				detail: { visibility, persisted: true },
			}));
		} catch (error) {
			console.error('[BookmarksBar] save visibility failed:', error);
		}
	}

	private showDeleteDialog(item: BookmarkItem, trigger: HTMLElement | null) {
		const { overlay, dialog, close } = this.createOverlay(
			isFolder(item) ? 'Delete folder' : 'Delete bookmark',
			trigger
		);
		const message = document.createElement('div');
		message.textContent = `Delete ${item.title || 'this item'}?`;
		dialog.appendChild(message);
		this.dialogActions(dialog, close, 'Delete', async () => {
			if (isFolder(item)) {
				await this.deps.bookmarkManager?.deleteFolder?.(item.id, true);
			} else {
				await this.deps.bookmarkManager?.deleteBookmark?.(item.id);
			}
			close();
		}, 'confirm-delete');
		document.body.appendChild(overlay);
		dialog.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')?.focus();
	}

	private showMovePicker(item: BookmarkItem, trigger: HTMLElement | null) {
		const { overlay, dialog, close } = this.createOverlay('Move to Folder', trigger);
		dialog.dataset.bookmarksMovePicker = '';
		const excluded = isFolder(item) ? this.folderDescendants(item.id) : new Set<string>();
		excluded.add(item.id);
		const destinations: Array<{ id?: string; title: string }> = [{ title: 'Bookmarks Bar' }];
		for (const folder of this.allFolders()) {
			if (!excluded.has(folder.id)) destinations.push({ id: folder.id, title: folder.title });
		}
		for (const destination of destinations) {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = destination.title || 'Untitled';
			button.addEventListener('click', async () => {
				await this.deps.bookmarkManager?.moveItem?.({
					itemId: item.id,
					newParentId: destination.id,
					newIndex: this.childrenOf(destination.id as string).length
				});
				close();
				this.focusItem(item.id);
			});
			dialog.appendChild(button);
		}
		document.body.appendChild(overlay);
		dialog.querySelector<HTMLButtonElement>('button')?.focus();
	}

	private createOverlay(title: string, trigger: HTMLElement | null) {
		const overlay = document.createElement('div');
		overlay.className = 'bookmarks-bar-dialog-overlay';
		const dialog = document.createElement('div');
		dialog.className = 'bookmarks-bar-dialog';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		const heading = document.createElement('div');
		heading.className = 'bookmarks-bar-dialog-title';
		heading.id = `bookmarks-bar-dialog-title-${++this.dialogId}`;
		heading.textContent = title;
		dialog.setAttribute('aria-labelledby', heading.id);
		dialog.appendChild(heading);
		overlay.appendChild(dialog);
		const close = () => {
			overlay.remove();
			document.removeEventListener('keydown', escape, true);
			this.dialogClosers.delete(close);
			if (trigger?.isConnected) trigger.focus();
		};
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		overlay.addEventListener('pointerdown', (event) => {
			if (event.target === overlay) close();
		});
		document.addEventListener('keydown', escape, true);
		this.dialogClosers.add(close);
		return { overlay, dialog, close };
	}

	private dialogActions(
		dialog: HTMLElement,
		close: () => void,
		confirmLabel: string,
		confirm: () => Promise<void>,
		confirmAction?: string
	) {
		const actions = document.createElement('div');
		actions.className = 'bookmarks-bar-dialog-actions';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'bookmarks-bar-dialog-btn cancel';
		cancel.textContent = 'Cancel';
		cancel.addEventListener('click', close);
		const save = document.createElement('button');
		save.type = 'button';
		save.className = 'bookmarks-bar-dialog-btn save';
		save.dataset.action = confirmAction ?? 'confirm';
		save.textContent = confirmLabel;
		save.addEventListener('click', () => void confirm());
		actions.append(cancel, save);
		dialog.appendChild(actions);
	}

	private allFolders(): BookmarkItem[] {
		const folders: BookmarkItem[] = [];
		const visit = (parentId?: string) => {
			for (const child of this.childrenOf(parentId as string)) {
				if (isFolder(child)) {
					folders.push(child);
					visit(child.id);
				}
			}
		};
		visit();
		return folders;
	}

	private folderDescendants(folderId: string): Set<string> {
		const descendants = new Set<string>();
		const visit = (parentId: string) => {
			for (const child of this.childrenOf(parentId)) {
				if (isFolder(child)) {
					descendants.add(child.id);
					visit(child.id);
				}
			}
		};
		visit(folderId);
		return descendants;
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private async openUrl(url: string) {
		if (!url) return;
		this.closeMenus();
		try {
			if (await this.deps.navigateActiveFrame(url)) {
				this.deps.logger?.createLog?.(`Opened bookmark: ${url}`);
			}
		} catch (error) {
			console.error('[BookmarksBar] failed to open bookmark:', error);
		}
	}

	private focusItem(itemId: string) {
		Array.from(this.root?.querySelectorAll<HTMLElement>('[data-item-id]') ?? [])
			.find((element) => element.dataset.itemId === itemId)
			?.focus();
	}

	private icon(name: string, extra?: string): HTMLElement {
		const i = document.createElement('i');
		i.setAttribute('data-lucide', name);
		i.className = extra
			? `bookmarks-bar-icon ${extra}`
			: 'bookmarks-bar-icon';
		return i;
	}

	/**
	 * Uses BookmarkManager's favicon cache when warm, otherwise falls back to a
	 * globe glyph. Broken images swap to the glyph so rows never show a torn
	 * image icon.
	 */
	private favicon(url: string): HTMLElement {
		const wrap = document.createElement('span');
		wrap.className = 'bookmarks-bar-favicon';

		let cached: string | null = null;
		try {
			cached =
				this.deps.bookmarkManager?.getCachedFavicon?.(url) ?? null;
		} catch {
			cached = null;
		}

		if (cached) {
			const img = document.createElement('img');
			img.src = cached;
			img.alt = '';
			img.addEventListener('error', () => {
				wrap.replaceChildren(this.icon('globe'));
				this.refreshIcons(wrap);
			});
			wrap.appendChild(img);
		} else {
			wrap.appendChild(this.icon('globe'));
		}

		return wrap;
	}

	private refreshIcons(scope: HTMLElement) {
		try {
			createIcons({
				icons: { ChevronDown, ChevronRight, ChevronsRight, Folder, Globe, Plus },
				nameAttr: 'data-lucide',
				root: scope
			} as any);
		} catch {
			try {
				createIcons({
					icons: { ChevronDown, ChevronRight, ChevronsRight, Folder, Globe, Plus }
				});
			} catch (error) {
				console.warn('[BookmarksBar] icon render failed:', error);
			}
		}
	}
}
