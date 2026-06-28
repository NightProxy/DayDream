// src/core/helium/host/history/handlers.ts
//
// chrome.history.* handlers backed by the DDX HistoryManager singleton.

import type { ExtensionContext } from '../../extfs/types';
import { HistoryManager, type HistoryEntry } from '@apis/history';

interface ChromeHistoryItem {
  id: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}

interface ChromeVisitItem {
  id: string;
  visitId: string;
  visitTime?: number;
  referringVisitId: string;
  transition: string;
}

function toChromeItem(entry: HistoryEntry): ChromeHistoryItem {
  return {
    id: entry.id,
    url: entry.url,
    title: entry.title,
    lastVisitTime: entry.visitedAt.getTime(),
    visitCount: entry.visitCount,
    typedCount: 0,
  };
}

export class HistoryHandlers {
  private readonly mgr: HistoryManager;

  constructor() {
    this.mgr = HistoryManager.getInstance();
  }

  search = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeHistoryItem[]> => {
    const q = (args[0] ?? {}) as {
      text?: string;
      startTime?: number;
      endTime?: number;
      maxResults?: number;
    };
    const text = q.text ?? '';
    const results = text
      ? this.mgr.searchEntries(text).map((r) => r.entry)
      : this.mgr.getEntries();
    const filtered = results.filter((entry) => {
      const t = entry.visitedAt.getTime();
      if (q.startTime !== undefined && t < q.startTime) return false;
      if (q.endTime !== undefined && t > q.endTime) return false;
      return true;
    });
    const maxResults = q.maxResults ?? 100;
    return filtered.slice(0, maxResults).map(toChromeItem);
  };

  getVisits = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeVisitItem[]> => {
    const opts = args[0] as { url?: string } | undefined;
    const url = opts?.url ?? '';
    const entries = this.mgr.getEntries().filter((e) => e.url === url);
    return entries.map((entry) => ({
      id: entry.id,
      visitId: entry.id,
      visitTime: entry.visitedAt.getTime(),
      referringVisitId: '0',
      transition: 'link',
    }));
  };

  addUrl = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { url?: string; title?: string };
    if (!opts?.url) throw new Error('chrome.history.addUrl requires url');
    await this.mgr.addEntry({
      title: opts.title ?? opts.url,
      url: opts.url,
    });
  };

  deleteUrl = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { url?: string };
    if (!opts?.url) return;
    const entries = this.mgr.getEntries().filter((e) => e.url === opts.url);
    for (const entry of entries) {
      await this.mgr.deleteEntry(entry.id);
    }
  };

  deleteRange = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const r = args[0] as { startTime?: number; endTime?: number };
    if (typeof r?.startTime !== 'number') return;
    const start = new Date(r.startTime);
    const end = typeof r.endTime === 'number' ? new Date(r.endTime) : new Date();
    await this.mgr.clearByTimeRange(start, end);
  };

  deleteAll = async (_ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    await this.mgr.clearAll();
  };
}
