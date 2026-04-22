import localforage from "localforage";
import { v4 as uuidv4 } from "uuid";

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  visitedAt: Date;
  sessionId: string;
  tabId?: string;
  visitCount: number;
  lastVisitDuration?: number;
}

export interface HistorySession {
  id: string;
  startTime: Date;
  endTime?: Date;
  tabCount: number;
  totalVisits: number;
}

export interface CreateHistoryEntryData {
  title: string;
  url: string;
  favicon?: string;
  tabId?: string;
  sessionId?: string;
}

export interface HistoryManagerConfig {
  storageKey?: string;
  maxEntries?: number;
  autoSync?: boolean;
  retentionDays?: number;
}

export interface HistorySearchResult {
  entry: HistoryEntry;
  relevanceScore: number;
}

export interface HistoryStats {
  totalEntries: number;
  totalSessions: number;
  todayEntries: number;
  weekEntries: number;
  topSites: Array<{ domain: string; visits: number }>;
}

export type HistoryFilter = "today" | "yesterday" | "week" | "month" | "all";

export class HistoryManager {
  private storageKey: string;
  private sessionStorageKey: string;
  private store: LocalForage;
  private autoSync: boolean;
  private maxEntries: number;
  private retentionDays: number;
  private entries: HistoryEntry[] = [];
  private sessions: HistorySession[] = [];
  private listeners: Set<() => void> = new Set();
  private currentSessionId: string;
  private visitStartTimes: Map<string, Date> = new Map();
  private storageLoaded: boolean = false;

  constructor(config: HistoryManagerConfig = {}) {
    this.storageKey = config.storageKey || "browsing-history";
    this.sessionStorageKey = "history-sessions";
    this.store = localforage.createInstance({
      name: "BrowsingHistory",
      storeName: "history",
    });
    this.autoSync = config.autoSync ?? true;
    this.maxEntries = config.maxEntries || 10000;
    this.retentionDays = config.retentionDays || 90;
    this.currentSessionId = sessionStorage.getItem("historySessionId") || "";
  }

  public addListener(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  private ensureSessionInitialized(): void {
    if (!this.currentSessionId && this.storageLoaded) {
      this.currentSessionId = this.getOrCreateCurrentSession();
    }
  }

  private getOrCreateCurrentSession(): string {
    const storedSessionId = sessionStorage.getItem("historySessionId");

    if (storedSessionId) {
      const existingSession = this.sessions.find(
        (s) => s.id === storedSessionId,
      );
      if (existingSession) {
        return storedSessionId;
      }
    }

    const sessionId = uuidv4();
    sessionStorage.setItem("historySessionId", sessionId);

    const session: HistorySession = {
      id: sessionId,
      startTime: new Date(),
      tabCount: 0,
      totalVisits: 0,
    };
    this.sessions.push(session);
    this.syncSessionsIfEnabled();

    return sessionId;
  }

  public async loadFromStorage(): Promise<void> {
    try {
      const data = await this.store.getItem<{
        entries: HistoryEntry[];
        sessions: HistorySession[];
      }>(this.storageKey);

      if (data) {
        this.entries =
          data.entries?.map((entry) => ({
            ...entry,
            visitedAt: new Date(entry.visitedAt),
          })) || [];
      }

      const sessionsData = await this.store.getItem<HistorySession[]>(
        this.sessionStorageKey,
      );
      if (sessionsData) {
        this.sessions = sessionsData.map((session) => ({
          ...session,
          startTime: new Date(session.startTime),
          endTime: session.endTime ? new Date(session.endTime) : undefined,
        }));
      }

      await this.cleanupOldEntries();
      this.notifyListeners();

      this.storageLoaded = true;

      if (!this.currentSessionId) {
        this.currentSessionId = this.getOrCreateCurrentSession();
      } else {
        const existingSession = this.sessions.find(
          (s) => s.id === this.currentSessionId,
        );
        if (!existingSession) {
          this.currentSessionId = this.getOrCreateCurrentSession();
        }
      }
    } catch (error) {
      console.error("Failed to load history from storage:", error);
      this.storageLoaded = true;
      if (!this.currentSessionId) {
        this.currentSessionId = this.getOrCreateCurrentSession();
      }
    }
  }

  public async saveToStorage(): Promise<void> {
    try {
      await this.store.setItem(this.storageKey, {
        entries: this.entries,
        sessions: this.sessions,
      });
    } catch (error) {
      console.error("Failed to save history to storage:", error);
    }
  }

  private async syncIfEnabled(): Promise<void> {
    if (this.autoSync) {
      await this.saveToStorage();
    }
  }

  private async syncSessionsIfEnabled(): Promise<void> {
    if (this.autoSync) {
      try {
        await this.store.setItem(this.sessionStorageKey, this.sessions);
      } catch (error) {
        console.error("Failed to save sessions to storage:", error);
      }
    }
  }

  public async addEntry(data: CreateHistoryEntryData): Promise<HistoryEntry> {
    this.ensureSessionInitialized();

    const now = new Date();
    const url = this.normalizeUrl(data.url);

    const existingEntry = this.entries.find(
      (entry) =>
        entry.url === url && now.getTime() - entry.visitedAt.getTime() < 30000,
    );

    if (existingEntry) {
      existingEntry.visitedAt = now;
      existingEntry.visitCount++;
      existingEntry.title = data.title;
      if (data.favicon) {
        existingEntry.favicon = data.favicon;
      }

      await this.syncIfEnabled();
      this.notifyListeners();
      return existingEntry;
    }

    const entry: HistoryEntry = {
      id: uuidv4(),
      title: data.title,
      url: url,
      favicon: data.favicon,
      visitedAt: now,
      sessionId: data.sessionId || this.currentSessionId,
      tabId: data.tabId,
      visitCount: 1,
    };

    this.entries.unshift(entry);

    const currentSession = this.sessions.find(
      (s) => s.id === this.currentSessionId,
    );
    if (currentSession) {
      currentSession.totalVisits++;
    }

    if (data.tabId) {
      this.visitStartTimes.set(data.tabId, now);
    }

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    await this.syncIfEnabled();
    this.notifyListeners();
    return entry;
  }

  public async recordTabClose(tabId: string): Promise<void> {
    const startTime = this.visitStartTimes.get(tabId);
    if (startTime) {
      const duration = Date.now() - startTime.getTime();

      const recentEntry = this.entries.find(
        (entry) =>
          entry.tabId === tabId &&
          Math.abs(entry.visitedAt.getTime() - startTime.getTime()) < 5000,
      );

      if (recentEntry) {
        recentEntry.lastVisitDuration = duration;
        await this.syncIfEnabled();
        this.notifyListeners();
      }

      this.visitStartTimes.delete(tabId);
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const paramsToRemove = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
      ];

      paramsToRemove.forEach((param) => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch {
      return url;
    }
  }

  public async deleteEntry(id: string): Promise<boolean> {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    await this.syncIfEnabled();
    this.notifyListeners();
    return true;
  }

  public async deleteEntriesByDomain(domain: string): Promise<number> {
    const initialLength = this.entries.length;
    this.entries = this.entries.filter((entry) => {
      try {
        const entryDomain = new URL(entry.url).hostname;
        return entryDomain !== domain;
      } catch {
        return true;
      }
    });

    const deletedCount = initialLength - this.entries.length;
    if (deletedCount > 0) {
      await this.syncIfEnabled();
      this.notifyListeners();
    }
    return deletedCount;
  }

  public async deleteEntriesByDate(date: Date): Promise<number> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const initialLength = this.entries.length;
    this.entries = this.entries.filter((entry) => {
      return entry.visitedAt < targetDate || entry.visitedAt >= nextDate;
    });

    const deletedCount = initialLength - this.entries.length;
    if (deletedCount > 0) {
      await this.syncIfEnabled();
      this.notifyListeners();
    }
    return deletedCount;
  }

  public getEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  public getEntriesByFilter(filter: HistoryFilter): HistoryEntry[] {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const week = new Date(today);
    week.setDate(week.getDate() - 7);

    const month = new Date(today);
    month.setMonth(month.getMonth() - 1);

    switch (filter) {
      case "today":
        return this.entries.filter((entry) => entry.visitedAt >= today);
      case "yesterday":
        return this.entries.filter(
          (entry) => entry.visitedAt >= yesterday && entry.visitedAt < today,
        );
      case "week":
        return this.entries.filter((entry) => entry.visitedAt >= week);
      case "month":
        return this.entries.filter((entry) => entry.visitedAt >= month);
      case "all":
      default:
        return [...this.entries];
    }
  }

  public getEntriesGroupedByDate(): Map<string, HistoryEntry[]> {
    const groups = new Map<string, HistoryEntry[]>();
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    this.entries.forEach((entry) => {
      let groupKey: string;

      if (entry.visitedAt >= today) {
        groupKey = "today";
      } else if (entry.visitedAt >= yesterday) {
        groupKey = "yesterday";
      } else {
        groupKey = "older";
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(entry);
    });

    return groups;
  }

  public searchEntries(query: string): HistorySearchResult[] {
    const lowercaseQuery = query.toLowerCase();
    const results: HistorySearchResult[] = [];

    this.entries.forEach((entry) => {
      let relevanceScore = 0;

      if (entry.title.toLowerCase().includes(lowercaseQuery)) {
        relevanceScore +=
          entry.title.toLowerCase().indexOf(lowercaseQuery) === 0 ? 100 : 50;
      }

      if (entry.url.toLowerCase().includes(lowercaseQuery)) {
        relevanceScore +=
          entry.url.toLowerCase().indexOf(lowercaseQuery) === 0 ? 75 : 25;
      }

      try {
        const domain = new URL(entry.url).hostname;
        if (domain.toLowerCase().includes(lowercaseQuery)) {
          relevanceScore += 40;
        }
      } catch {}

      relevanceScore += Math.min(entry.visitCount * 2, 20);

      const daysSinceVisit =
        (Date.now() - entry.visitedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit < 1) relevanceScore += 15;
      else if (daysSinceVisit < 7) relevanceScore += 10;
      else if (daysSinceVisit < 30) relevanceScore += 5;

      if (relevanceScore > 0) {
        results.push({ entry, relevanceScore });
      }
    });

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  public getMostVisitedSites(
    limit: number = 10,
  ): Array<{ domain: string; visits: number; lastVisit: Date }> {
    const domainStats = new Map<string, { visits: number; lastVisit: Date }>();

    this.entries.forEach((entry) => {
      try {
        const domain = new URL(entry.url).hostname;
        const existing = domainStats.get(domain);

        if (existing) {
          existing.visits += entry.visitCount;
          if (entry.visitedAt > existing.lastVisit) {
            existing.lastVisit = entry.visitedAt;
          }
        } else {
          domainStats.set(domain, {
            visits: entry.visitCount,
            lastVisit: entry.visitedAt,
          });
        }
      } catch {}
    });

    return Array.from(domainStats.entries())
      .map(([domain, stats]) => ({ domain, ...stats }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, limit);
  }

  public getHistoryStats(): HistoryStats {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const week = new Date(today);
    week.setDate(week.getDate() - 7);

    const todayEntries = this.entries.filter(
      (entry) => entry.visitedAt >= today,
    ).length;
    const weekEntries = this.entries.filter(
      (entry) => entry.visitedAt >= week,
    ).length;
    const topSites = this.getMostVisitedSites(5).map((site) => ({
      domain: site.domain,
      visits: site.visits,
    }));

    return {
      totalEntries: this.entries.length,
      totalSessions: this.sessions.length,
      todayEntries,
      weekEntries,
      topSites,
    };
  }

  public async clearAll(): Promise<void> {
    this.entries = [];
    this.sessions = [];
    this.visitStartTimes.clear();
    await this.syncIfEnabled();
    this.notifyListeners();
  }

  public async clearByTimeRange(
    startDate: Date,
    endDate?: Date,
  ): Promise<number> {
    const initialLength = this.entries.length;
    const end = endDate || new Date();

    this.entries = this.entries.filter((entry) => {
      return entry.visitedAt < startDate || entry.visitedAt > end;
    });

    const deletedCount = initialLength - this.entries.length;
    if (deletedCount > 0) {
      await this.syncIfEnabled();
      this.notifyListeners();
    }
    return deletedCount;
  }

  private async cleanupOldEntries(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const initialLength = this.entries.length;
    this.entries = this.entries.filter(
      (entry) => entry.visitedAt >= cutoffDate,
    );

    if (this.entries.length !== initialLength) {
      console.log(
        `Cleaned up ${initialLength - this.entries.length} old history entries`,
      );
    }

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  public async exportData(): Promise<string> {
    return JSON.stringify(
      {
        entries: this.entries,
        sessions: this.sessions,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      },
      null,
      2,
    );
  }

  public async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      if (data.entries) {
        const importedEntries = data.entries.map((entry: any) => ({
          ...entry,
          visitedAt: new Date(entry.visitedAt),
        }));

        const existingUrls = new Set(
          this.entries.map((e) => `${e.url}-${e.visitedAt.toISOString()}`),
        );
        const newEntries = importedEntries.filter(
          (entry: HistoryEntry) =>
            !existingUrls.has(`${entry.url}-${entry.visitedAt.toISOString()}`),
        );

        this.entries = [...newEntries, ...this.entries]
          .sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime())
          .slice(0, this.maxEntries);

        if (data.sessions) {
          const importedSessions = data.sessions.map((session: any) => ({
            ...session,
            startTime: new Date(session.startTime),
            endTime: session.endTime ? new Date(session.endTime) : undefined,
          }));

          const existingSessionIds = new Set(this.sessions.map((s) => s.id));
          const newSessions = importedSessions.filter(
            (session: HistorySession) => !existingSessionIds.has(session.id),
          );

          this.sessions = [...this.sessions, ...newSessions].sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime(),
          );
        }

        await this.syncIfEnabled();
        this.notifyListeners();
      }
    } catch (error) {
      throw new Error("Invalid history data format");
    }
  }

  public getCurrentSessionId(): string {
    this.ensureSessionInitialized();
    return this.currentSessionId;
  }

  public async endCurrentSession(): Promise<void> {
    this.ensureSessionInitialized();
    const currentSession = this.sessions.find(
      (s) => s.id === this.currentSessionId,
    );
    if (currentSession && !currentSession.endTime) {
      currentSession.endTime = new Date();
      await this.syncSessionsIfEnabled();
    }
  }

  public getSessions(): HistorySession[] {
    return [...this.sessions];
  }

  public getSessionEntries(sessionId: string): HistoryEntry[] {
    return this.entries.filter((entry) => entry.sessionId === sessionId);
  }

  private getDomainFromUrl(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  public getEntriesByDomain(domain: string): HistoryEntry[] {
    return this.entries.filter((entry) => {
      const entryDomain = this.getDomainFromUrl(entry.url);
      return entryDomain === domain;
    });
  }

  public async updateEntry(
    id: string,
    updates: Partial<Omit<HistoryEntry, "id" | "visitedAt">>,
  ): Promise<HistoryEntry | null> {
    const entry = this.entries.find((entry) => entry.id === id);
    if (!entry) return null;

    Object.assign(entry, {
      ...updates,
    });

    await this.syncIfEnabled();
    this.notifyListeners();
    return entry;
  }

  public getEntriesPaginated(
    filter: HistoryFilter = "all",
    offset: number = 0,
    limit: number = 50,
  ): { entries: HistoryEntry[]; hasMore: boolean; total: number } {
    const filteredEntries = this.getEntriesByFilter(filter);
    const total = filteredEntries.length;
    const entries = filteredEntries.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { entries, hasMore, total };
  }

  public async performMaintenance(): Promise<void> {
    await this.cleanupOldEntries();

    const currentTime = Date.now();
    for (const [tabId, startTime] of this.visitStartTimes.entries()) {
      if (currentTime - startTime.getTime() > 60 * 60 * 1000) {
        this.visitStartTimes.delete(tabId);
      }
    }

    await this.syncIfEnabled();
  }
}
