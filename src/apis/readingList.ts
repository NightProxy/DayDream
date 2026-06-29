// src/apis/readingList.ts
//
// Reading list store — backs `chrome.readingList.*` and any future
// DDX Reading List UI page. Mirrors the HistoryManager / BookmarkManager
// shape: singleton, SettingsAPI-persisted, change-event emission, generic
// + typed listener APIs.
//
// Chrome's contract:
//   addEntry({url, title, hasBeenRead}) → Promise<ReadingListEntry>
//   query(info)                          → Promise<ReadingListEntry[]>
//   removeEntry({url})                   → Promise<void>
//   updateEntry({url, title?, hasBeenRead?}) → Promise<ReadingListEntry>
//   onEntryAdded / onEntryUpdated / onEntryRemoved
//
// Entry shape:
//   { url, title, hasBeenRead, creationTime, lastUpdateTime }
//
// Identity is the URL — duplicate URLs are NOT allowed; addEntry on an
// existing URL throws (matches Chrome). To change a flag, use updateEntry.

import { SettingsAPI } from './settings';

export interface ReadingListEntry {
	/** Canonical URL — the identity key. */
	url: string;
	/** Display title. Required by Chrome, defaults to URL if empty. */
	title: string;
	/** Whether the user has marked the entry as read. Default false. */
	hasBeenRead: boolean;
	/** Epoch ms — entry creation. */
	creationTime: number;
	/** Epoch ms — last mutation. */
	lastUpdateTime: number;
}

/** Query filter — all fields optional; AND-combined. */
export interface ReadingListQuery {
	url?: string;
	title?: string;
	hasBeenRead?: boolean;
}

export type ReadingListChangeEvent =
	| { type: 'added'; entry: ReadingListEntry }
	| { type: 'updated'; entry: ReadingListEntry }
	| { type: 'removed'; entry: ReadingListEntry };

export interface ReadingListManagerConfig {
	storageKey?: string;
	autoSync?: boolean;
}

export class ReadingListManager {
	private static instance: ReadingListManager | null = null;

	/**
	 * Returns the shared ReadingListManager singleton. Config is only
	 * consulted on first call.
	 */
	public static getInstance(
		config: ReadingListManagerConfig = {}
	): ReadingListManager {
		if (!ReadingListManager.instance) {
			ReadingListManager.instance = new ReadingListManager(config);
		}
		return ReadingListManager.instance;
	}

	private readonly storageKey: string;
	private readonly store: SettingsAPI;
	private readonly autoSync: boolean;

	private entries: ReadingListEntry[] = [];
	private loaded = false;
	private loadPromise: Promise<void> | null = null;

	private writeQueue: Promise<void> = Promise.resolve();

	private readonly listeners = new Set<() => void>();
	private readonly changeListeners = new Set<(e: ReadingListChangeEvent) => void>();

	constructor(config: ReadingListManagerConfig = {}) {
		this.storageKey = config.storageKey || 'reading-list';
		this.store = new SettingsAPI('/data/readingList.json', '/data');
		this.autoSync = config.autoSync ?? true;
	}

	/** Generic notify (no payload) — used by UIs that re-read state on any change. */
	addListener(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	/** Typed change events — used by `chrome.readingList.on*` fan-out. */
	addChangeListener(fn: (e: ReadingListChangeEvent) => void): () => void {
		this.changeListeners.add(fn);
		return () => this.changeListeners.delete(fn);
	}

	private notify(): void {
		for (const cb of this.listeners) {
			try {
				cb();
			} catch (err) {
				console.error('[ReadingListManager] listener threw:', err);
			}
		}
	}

	private emitChange(event: ReadingListChangeEvent): void {
		for (const fn of this.changeListeners) {
			try {
				fn(event);
			} catch (err) {
				console.error('[ReadingListManager] change listener threw:', err);
			}
		}
		this.notify();
	}

	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		if (this.loadPromise) {
			await this.loadPromise;
			return;
		}
		this.loadPromise = this.loadFromStorage();
		try {
			await this.loadPromise;
		} finally {
			this.loadPromise = null;
		}
	}

	private async loadFromStorage(): Promise<void> {
		try {
			const raw = await this.store.getItem<ReadingListEntry[]>(this.storageKey);
			if (Array.isArray(raw)) {
				this.entries = raw
					.filter((e): e is ReadingListEntry =>
						!!e && typeof e.url === 'string' && e.url.length > 0,
					)
					.map((e) => ({
						url: e.url,
						title: typeof e.title === 'string' ? e.title : e.url,
						hasBeenRead: !!e.hasBeenRead,
						creationTime: Number(e.creationTime) || Date.now(),
						lastUpdateTime: Number(e.lastUpdateTime) || Date.now(),
					}));
			}
		} catch (err) {
			console.warn('[ReadingListManager] loadFromStorage failed:', err);
		} finally {
			this.loaded = true;
		}
	}

	private enqueueWrite(): void {
		this.writeQueue = this.writeQueue.then(() => this.saveToStorage());
	}

	private async saveToStorage(): Promise<void> {
		if (!this.autoSync) return;
		try {
			await this.store.setItem(this.storageKey, this.entries);
		} catch (err) {
			console.warn('[ReadingListManager] saveToStorage failed:', err);
		}
	}

	/** Add a new entry. Throws if URL already exists (Chrome contract). */
	async addEntry(opts: {
		url: string;
		title: string;
		hasBeenRead?: boolean;
	}): Promise<ReadingListEntry> {
		if (!opts?.url || typeof opts.url !== 'string') {
			throw new Error('chrome.readingList.addEntry requires url');
		}
		await this.ensureLoaded();
		if (this.entries.find((e) => e.url === opts.url)) {
			throw new Error(
				`chrome.readingList.addEntry: entry with url "${opts.url}" already exists`,
			);
		}
		const now = Date.now();
		const entry: ReadingListEntry = {
			url: opts.url,
			title: opts.title || opts.url,
			hasBeenRead: !!opts.hasBeenRead,
			creationTime: now,
			lastUpdateTime: now,
		};
		this.entries.push(entry);
		this.enqueueWrite();
		this.emitChange({ type: 'added', entry });
		return entry;
	}

	/** Query — AND filter across given fields. */
	async query(filter: ReadingListQuery = {}): Promise<ReadingListEntry[]> {
		await this.ensureLoaded();
		return this.entries.filter((e) => {
			if (filter.url !== undefined && e.url !== filter.url) return false;
			if (filter.title !== undefined && e.title !== filter.title) return false;
			if (filter.hasBeenRead !== undefined && e.hasBeenRead !== filter.hasBeenRead) {
				return false;
			}
			return true;
		});
	}

	/** Remove by URL. Returns the removed entry, or null if not present. */
	async removeEntry(opts: { url: string }): Promise<ReadingListEntry | null> {
		if (!opts?.url) throw new Error('chrome.readingList.removeEntry requires url');
		await this.ensureLoaded();
		const idx = this.entries.findIndex((e) => e.url === opts.url);
		if (idx < 0) return null;
		const [removed] = this.entries.splice(idx, 1);
		this.enqueueWrite();
		this.emitChange({ type: 'removed', entry: removed! });
		return removed!;
	}

	/** Update title or read state. Throws if URL not found (Chrome contract). */
	async updateEntry(opts: {
		url: string;
		title?: string;
		hasBeenRead?: boolean;
	}): Promise<ReadingListEntry> {
		if (!opts?.url) throw new Error('chrome.readingList.updateEntry requires url');
		await this.ensureLoaded();
		const entry = this.entries.find((e) => e.url === opts.url);
		if (!entry) {
			throw new Error(
				`chrome.readingList.updateEntry: no entry with url "${opts.url}"`,
			);
		}
		if (typeof opts.title === 'string') entry.title = opts.title;
		if (typeof opts.hasBeenRead === 'boolean') entry.hasBeenRead = opts.hasBeenRead;
		entry.lastUpdateTime = Date.now();
		this.enqueueWrite();
		this.emitChange({ type: 'updated', entry });
		return entry;
	}

	/** Read-only snapshot. */
	async getAll(): Promise<ReadingListEntry[]> {
		await this.ensureLoaded();
		return [...this.entries];
	}

	/** Wipe everything. Emits one `removed` event per entry. */
	async clear(): Promise<void> {
		await this.ensureLoaded();
		const removed = [...this.entries];
		this.entries = [];
		this.enqueueWrite();
		for (const entry of removed) {
			this.emitChange({ type: 'removed', entry });
		}
	}
}
