import localforage from "localforage";
import { v4 as uuidv4 } from "uuid";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  index: number;
}

export interface BookmarkFolder {
  id: string;
  title: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  index: number;
  expanded?: boolean;
}

export type BookmarkItem = Bookmark | BookmarkFolder;

export interface BookmarkTreeNode {
  item: BookmarkItem;
  children: BookmarkTreeNode[];
}

export interface CreateBookmarkData {
  title: string;
  url: string;
  parentId?: string;
}

export interface CreateFolderData {
  title: string;
  parentId?: string;
}

export interface MoveItemData {
  itemId: string;
  newParentId?: string;
  newIndex: number;
}

export interface BookmarkManagerConfig {
  storageKey?: string;
  autoSync?: boolean;
}

export interface FaviconCacheEntry {
  host: string;
  faviconDataUrl: string;
  fetchedAt: Date;
  expiresAt: Date;
}

export interface FaviconCache {
  [host: string]: FaviconCacheEntry;
}

export function isFolder(item: BookmarkItem): item is BookmarkFolder {
  return !("url" in item);
}

export function isBookmark(item: BookmarkItem): item is Bookmark {
  return "url" in item;
}

export class BookmarkManager {
  private storageKey: string;
  private faviconCacheKey: string;
  private store: LocalForage;
  private autoSync: boolean;
  private bookmarks: Bookmark[] = [];
  private folders: BookmarkFolder[] = [];
  private faviconCache: FaviconCache = {};
  private listeners: Set<() => void> = new Set();

  constructor(config: BookmarkManagerConfig = {}) {
    this.storageKey = config.storageKey || "bookmarks-data";
    this.faviconCacheKey = "favicon-cache";
    this.store = localforage.createInstance({
      name: "Bookmarks",
      storeName: "bookmarks",
    });
    this.autoSync = config.autoSync ?? true;
  }

  // Event listener management
  public addListener(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  // Storage operations
  public async loadFromStorage(): Promise<void> {
    try {
      const data = await this.store.getItem<{
        bookmarks: Bookmark[];
        folders: BookmarkFolder[];
      }>(this.storageKey);

      if (data) {
        this.bookmarks = data.bookmarks.map((b) => ({
          ...b,
          createdAt: new Date(b.createdAt),
          updatedAt: new Date(b.updatedAt),
        }));
        this.folders = data.folders.map((f) => ({
          ...f,
          createdAt: new Date(f.createdAt),
          updatedAt: new Date(f.updatedAt),
        }));
        this.notifyListeners();
      }

      // Load favicon cache
      const faviconCacheData = await this.store.getItem<FaviconCache>(
        this.faviconCacheKey,
      );
      if (faviconCacheData) {
        // Filter out expired entries
        const now = new Date();
        this.faviconCache = {};
        Object.entries(faviconCacheData).forEach(([host, entry]) => {
          if (new Date(entry.expiresAt) > now) {
            this.faviconCache[host] = {
              ...entry,
              fetchedAt: new Date(entry.fetchedAt),
              expiresAt: new Date(entry.expiresAt),
            };
          }
        });
      }
    } catch (error) {
      console.error("Failed to load bookmarks from storage:", error);
    }
  }

  public async saveToStorage(): Promise<void> {
    try {
      await this.store.setItem(this.storageKey, {
        bookmarks: this.bookmarks,
        folders: this.folders,
      });

      // Save favicon cache
      await this.store.setItem(this.faviconCacheKey, this.faviconCache);
    } catch (error) {
      console.error("Failed to save bookmarks to storage:", error);
    }
  }

  private async syncIfEnabled(): Promise<void> {
    if (this.autoSync) {
      await this.saveToStorage();
    }
  }

  // Bookmark operations
  public async createBookmark(data: CreateBookmarkData): Promise<Bookmark> {
    if (!data.title || !data.url) {
      throw new Error("Title and URL are required for bookmark creation");
    }

    const now = new Date();
    const siblings = this.getItemsByParent(data.parentId);
    const maxIndex = Math.max(...siblings.map((s) => s.index), -1);

    const bookmark: Bookmark = {
      id: uuidv4(),
      title: data.title.trim(),
      url: data.url.trim(),
      parentId: data.parentId || undefined,
      createdAt: now,
      updatedAt: now,
      index: maxIndex + 1,
    };

    this.bookmarks.push(bookmark);
    await this.syncIfEnabled();
    this.notifyListeners();
    return bookmark;
  }

  public async updateBookmark(
    id: string,
    updates: Partial<Omit<Bookmark, "id" | "createdAt">>,
  ): Promise<Bookmark | null> {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return null;

    // Clean up the updates
    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.title) cleanUpdates.title = cleanUpdates.title.trim();
    if (cleanUpdates.url) cleanUpdates.url = cleanUpdates.url.trim();

    this.bookmarks[index] = {
      ...this.bookmarks[index],
      ...cleanUpdates,
      updatedAt: new Date(),
    };

    await this.syncIfEnabled();
    this.notifyListeners();
    return this.bookmarks[index];
  }

  public async deleteBookmark(id: string): Promise<boolean> {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return false;

    this.bookmarks.splice(index, 1);
    await this.syncIfEnabled();
    this.notifyListeners();
    return true;
  }

  // Folder operations
  public async createFolder(data: CreateFolderData): Promise<BookmarkFolder> {
    const now = new Date();
    const siblings = this.getItemsByParent(data.parentId);
    const maxIndex = Math.max(...siblings.map((s) => s.index), -1);

    const folder: BookmarkFolder = {
      id: uuidv4(),
      title: data.title,
      parentId: data.parentId,
      createdAt: now,
      updatedAt: now,
      index: maxIndex + 1,
      expanded: true,
    };

    this.folders.push(folder);
    await this.syncIfEnabled();
    this.notifyListeners();
    return folder;
  }

  public async updateFolder(
    id: string,
    updates: Partial<Omit<BookmarkFolder, "id" | "createdAt">>,
  ): Promise<BookmarkFolder | null> {
    const index = this.folders.findIndex((f) => f.id === id);
    if (index === -1) return null;

    this.folders[index] = {
      ...this.folders[index],
      ...updates,
      updatedAt: new Date(),
    };

    await this.syncIfEnabled();
    this.notifyListeners();
    return this.folders[index];
  }

  public async deleteFolder(
    id: string,
    deleteContents: boolean = false,
  ): Promise<boolean> {
    const folderIndex = this.folders.findIndex((f) => f.id === id);
    if (folderIndex === -1) return false;

    if (deleteContents) {
      // Recursively delete all contents
      const childItems = this.getItemsByParent(id);
      for (const child of childItems) {
        if (isFolder(child)) {
          await this.deleteFolder(child.id, true);
        } else {
          await this.deleteBookmark(child.id);
        }
      }
    } else {
      // Move contents to parent folder
      const folder = this.folders[folderIndex];
      const childItems = this.getItemsByParent(id);
      for (const child of childItems) {
        await this.moveItem({
          itemId: child.id,
          newParentId: folder.parentId,
          newIndex: child.index,
        });
      }
    }

    this.folders.splice(folderIndex, 1);
    await this.syncIfEnabled();
    this.notifyListeners();
    return true;
  }

  // Move operations
  public async moveItem(data: MoveItemData): Promise<boolean> {
    const item = this.getItemById(data.itemId);
    if (!item) return false;

    // Update the item's parent and reorder siblings
    if (isFolder(item)) {
      const folderIndex = this.folders.findIndex((f) => f.id === data.itemId);
      this.folders[folderIndex] = {
        ...this.folders[folderIndex],
        parentId: data.newParentId,
        updatedAt: new Date(),
      };
    } else {
      const bookmarkIndex = this.bookmarks.findIndex(
        (b) => b.id === data.itemId,
      );
      this.bookmarks[bookmarkIndex] = {
        ...this.bookmarks[bookmarkIndex],
        parentId: data.newParentId,
        updatedAt: new Date(),
      };
    }

    // Reorder items in the new parent
    this.reorderItems(data.newParentId, data.itemId, data.newIndex);

    await this.syncIfEnabled();
    this.notifyListeners();
    return true;
  }

  private reorderItems(
    parentId: string | undefined,
    movedItemId: string,
    newIndex: number,
  ): void {
    const siblings = this.getItemsByParent(parentId).filter(
      (item) => item.id !== movedItemId,
    );
    siblings.splice(newIndex, 0, this.getItemById(movedItemId)!);

    siblings.forEach((item, index) => {
      if (isFolder(item)) {
        const folderIndex = this.folders.findIndex((f) => f.id === item.id);
        this.folders[folderIndex].index = index;
      } else {
        const bookmarkIndex = this.bookmarks.findIndex((b) => b.id === item.id);
        this.bookmarks[bookmarkIndex].index = index;
      }
    });
  }

  // Query operations
  public getBookmarks(): Bookmark[] {
    return [...this.bookmarks];
  }

  public getFolders(): BookmarkFolder[] {
    return [...this.folders];
  }

  public getItemById(id: string): BookmarkItem | null {
    return (
      this.bookmarks.find((b) => b.id === id) ||
      this.folders.find((f) => f.id === id) ||
      null
    );
  }

  public getItemsByParent(parentId?: string): BookmarkItem[] {
    const bookmarksInParent = this.bookmarks.filter(
      (b) => b && b.parentId === parentId,
    );
    const foldersInParent = this.folders.filter(
      (f) => f && f.parentId === parentId,
    );

    return [...bookmarksInParent, ...foldersInParent]
      .filter(Boolean) // Remove any null/undefined items
      .sort((a, b) => (a?.index || 0) - (b?.index || 0));
  }

  public buildTree(parentId?: string): BookmarkTreeNode[] {
    const items = this.getItemsByParent(parentId);

    return items.map((item) => ({
      item,
      children: isFolder(item) ? this.buildTree(item.id) : [],
    }));
  }

  public searchBookmarks(query: string): BookmarkItem[] {
    const lowercaseQuery = query.toLowerCase();

    const matchingBookmarks = this.bookmarks.filter(
      (bookmark) =>
        bookmark.title.toLowerCase().includes(lowercaseQuery) ||
        bookmark.url.toLowerCase().includes(lowercaseQuery),
    );

    const matchingFolders = this.folders.filter((folder) =>
      folder.title.toLowerCase().includes(lowercaseQuery),
    );

    return [...matchingBookmarks, ...matchingFolders];
  }

  public async exportData(): Promise<string> {
    return JSON.stringify(
      {
        bookmarks: this.bookmarks,
        folders: this.folders,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  public async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      if (data.bookmarks && data.folders) {
        this.bookmarks = data.bookmarks.map((b: any) => ({
          ...b,
          createdAt: new Date(b.createdAt),
          updatedAt: new Date(b.updatedAt),
        }));
        this.folders = data.folders.map((f: any) => ({
          ...f,
          createdAt: new Date(f.createdAt),
          updatedAt: new Date(f.updatedAt),
        }));

        await this.syncIfEnabled();
        this.notifyListeners();
      }
    } catch (error) {
      throw new Error("Invalid bookmark data format");
    }
  }

  public async clearAll(): Promise<void> {
    this.bookmarks = [];
    this.folders = [];
    this.faviconCache = {};
    await this.syncIfEnabled();
    this.notifyListeners();
  }

  // Favicon caching methods
  private getHostFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch (error) {
      return null;
    }
  }

  public getCachedFavicon(url: string): string | null {
    const host = this.getHostFromUrl(url);
    if (!host) return null;

    const entry = this.faviconCache[host];
    if (!entry) return null;

    // Check if entry is expired
    if (new Date() > entry.expiresAt) {
      delete this.faviconCache[host];
      return null;
    }

    return entry.faviconDataUrl;
  }

  public async cacheFavicon(
    url: string,
    faviconDataUrl: string,
  ): Promise<void> {
    const host = this.getHostFromUrl(url);
    if (!host) return;

    // Don't cache if it's the default favicon
    if (
      faviconDataUrl.includes(
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYi",
      )
    ) {
      return;
    }

    // Cache for 7 days
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    this.faviconCache[host] = {
      host,
      faviconDataUrl,
      fetchedAt: now,
      expiresAt,
    };

    // Save to storage if auto-sync is enabled
    if (this.autoSync) {
      try {
        await this.store.setItem(this.faviconCacheKey, this.faviconCache);
      } catch (error) {
        console.error("Failed to save favicon cache:", error);
      }
    }
  }

  public clearFaviconCache(): void {
    this.faviconCache = {};
    if (this.autoSync) {
      this.store.removeItem(this.faviconCacheKey).catch((error) => {
        console.error("Failed to clear favicon cache from storage:", error);
      });
    }
  }

  public getFaviconCacheStats(): { totalEntries: number; totalSize: number } {
    const entries = Object.values(this.faviconCache);
    const totalSize = entries.reduce(
      (size, entry) => size + entry.faviconDataUrl.length,
      0,
    );
    return {
      totalEntries: entries.length,
      totalSize,
    };
  }
}
