import localforage from "localforage";

interface TabCache {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  pinned: boolean;
  groupId?: string;
  order: number;
}

interface TabGroupCache {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  order: number;
}

interface CacheData {
  tabs: TabCache[];
  groups: TabGroupCache[];
  activeTabId?: string;
  timestamp: number;
}

class CacheAPI {
  private store: LocalForage;
  private initialized: boolean = false;

  constructor() {
    this.store = localforage.createInstance({
      name: "ddx",
      storeName: "cache",
      description: "DayDreamX cache storage for tabs and session data",
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async saveTabs(tabs: TabCache[]): Promise<void> {
    const existing = await this.getCache();
    await this.store.setItem("session", {
      ...existing,
      tabs,
      timestamp: Date.now(),
    });
  }

  async saveGroups(groups: TabGroupCache[]): Promise<void> {
    const existing = await this.getCache();
    await this.store.setItem("session", {
      ...existing,
      groups,
      timestamp: Date.now(),
    });
  }

  async saveSession(data: Partial<CacheData>): Promise<void> {
    const existing = await this.getCache();
    await this.store.setItem("session", {
      ...existing,
      ...data,
      timestamp: Date.now(),
    });
  }

  async getCache(): Promise<CacheData> {
    const data = await this.store.getItem<CacheData>("session");
    return (
      data || {
        tabs: [],
        groups: [],
        timestamp: Date.now(),
      }
    );
  }

  async getTabs(): Promise<TabCache[]> {
    const cache = await this.getCache();
    return cache.tabs || [];
  }

  async getGroups(): Promise<TabGroupCache[]> {
    const cache = await this.getCache();
    return cache.groups || [];
  }

  async getActiveTabId(): Promise<string | undefined> {
    const cache = await this.getCache();
    return cache.activeTabId;
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }

  async removeOldCache(
    maxAge: number = 7 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    const cache = await this.getCache();
    if (cache.timestamp && Date.now() - cache.timestamp > maxAge) {
      await this.clear();
    }
  }
}

export const cache = new CacheAPI();
export type { TabCache, TabGroupCache, CacheData };
