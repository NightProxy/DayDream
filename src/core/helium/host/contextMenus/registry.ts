
import { readExtensionFile, writeExtensionFile } from '../../extfs';

export type ContextType =
  | 'all'
  | 'page'
  | 'frame'
  | 'selection'
  | 'link'
  | 'editable'
  | 'image'
  | 'video'
  | 'audio'
  | 'launcher'
  | 'browser_action'
  | 'page_action'
  | 'action'
  | 'tab';

export interface MenuEntry {
  id: string;
  title?: string;
  type?: 'normal' | 'checkbox' | 'radio' | 'separator';
  checked?: boolean;
  contexts?: ContextType[];
  visible?: boolean;
  enabled?: boolean;
  parentId?: string;
  documentUrlPatterns?: string[];
  targetUrlPatterns?: string[];
}

interface StoredMenus {
  version: 1;
  menus: MenuEntry[];
}

export interface ContextInfo {
  pageUrl?: string;
  linkUrl?: string;
  srcUrl?: string;
  selectionText?: string;
  frameUrl?: string;
  editable?: boolean;
}

export class ContextMenuRegistry {
  private byExt = new Map<string, Map<string, MenuEntry>>();
  private loaded = new Set<string>();
  private autoId = 1;

  async restoreForExt(extId: string): Promise<void> {
    if (this.loaded.has(extId)) return;
    this.loaded.add(extId);
    try {
      const bytes = await readExtensionFile(extId, '__helium_contextmenus__.json');
      if (!bytes) return;
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as StoredMenus;
      if (parsed?.version !== 1 || !Array.isArray(parsed.menus)) return;
      const map = new Map<string, MenuEntry>();
      for (const m of parsed.menus) map.set(m.id, m);
      this.byExt.set(extId, map);
    } catch (err) {
      console.warn(`[helium/contextMenus] restore failed for ${extId}:`, err);
    }
  }

  async create(extId: string, props: Omit<MenuEntry, 'id'> & { id?: string | number }): Promise<string> {
    await this.restoreForExt(extId);
    const id = props.id !== undefined ? String(props.id) : `menu-${this.autoId++}`;
    let map = this.byExt.get(extId);
    if (!map) { map = new Map(); this.byExt.set(extId, map); }
    const entry: MenuEntry = {
      id,
      title: props.title ?? '',
      type: props.type ?? 'normal',
      contexts: props.contexts ?? ['page'],
      visible: props.visible !== false,
      enabled: props.enabled !== false,
    };
    if (props.checked !== undefined) entry.checked = props.checked;
    if (props.parentId !== undefined) entry.parentId = props.parentId;
    if (props.documentUrlPatterns) entry.documentUrlPatterns = props.documentUrlPatterns;
    if (props.targetUrlPatterns) entry.targetUrlPatterns = props.targetUrlPatterns;
    map.set(id, entry);
    await this.persist(extId);
    return id;
  }

  async update(extId: string, id: string, changes: Partial<MenuEntry>): Promise<boolean> {
    await this.restoreForExt(extId);
    const map = this.byExt.get(extId);
    if (!map) return false;
    const cur = map.get(id);
    if (!cur) return false;
    const next: MenuEntry = { ...cur, ...changes, id };
    map.set(id, next);
    await this.persist(extId);
    return true;
  }

  async remove(extId: string, id: string): Promise<boolean> {
    await this.restoreForExt(extId);
    const map = this.byExt.get(extId);
    if (!map) return false;
    const had = map.delete(id);
    for (const [k, v] of map.entries()) {
      if (v.parentId === id) map.delete(k);
    }
    if (had) await this.persist(extId);
    return had;
  }

  async removeAll(extId: string): Promise<void> {
    await this.restoreForExt(extId);
    const map = this.byExt.get(extId);
    if (!map) return;
    map.clear();
    await this.persist(extId);
  }

  clearForExt(extId: string): void {
    this.byExt.delete(extId);
    this.loaded.delete(extId);
  }

  /**
   * Get all menus across all extensions matching `contextType`.
   * Filters by `contexts` array, `documentUrlPatterns`, `targetUrlPatterns`.
   */
  getMenusForContext(contextType: ContextType, info: ContextInfo): Array<{ extId: string; entry: MenuEntry }> {
    const out: Array<{ extId: string; entry: MenuEntry }> = [];
    for (const [extId, map] of this.byExt) {
      for (const entry of map.values()) {
        if (entry.visible === false) continue;
        if (!entryMatchesContext(entry, contextType)) continue;
        if (entry.documentUrlPatterns && info.pageUrl && !matchesAnyPattern(entry.documentUrlPatterns, info.pageUrl)) continue;
        if (entry.targetUrlPatterns) {
          const target = info.linkUrl ?? info.srcUrl;
          if (!target || !matchesAnyPattern(entry.targetUrlPatterns, target)) continue;
        }
        out.push({ extId, entry });
      }
    }
    return out;
  }

  private async persist(extId: string): Promise<void> {
    const map = this.byExt.get(extId);
    const stored: StoredMenus = {
      version: 1,
      menus: map ? Array.from(map.values()) : [],
    };
    try {
      await writeExtensionFile(
        extId,
        '__helium_contextmenus__.json',
        new TextEncoder().encode(JSON.stringify(stored)),
      );
    } catch (err) {
      console.warn(`[helium/contextMenus] persist failed for ${extId}:`, err);
    }
  }
}

function entryMatchesContext(entry: MenuEntry, ctx: ContextType): boolean {
  const list = entry.contexts ?? ['page'];
  if (list.includes('all')) {
    return !['launcher', 'browser_action', 'page_action', 'action', 'tab'].includes(ctx);
  }
  return list.includes(ctx);
}

function matchesAnyPattern(patterns: string[], url: string): boolean {
  for (const p of patterns) {
    if (urlPatternMatches(p, url)) return true;
  }
  return false;
}

function urlPatternMatches(pattern: string, url: string): boolean {
  if (pattern === '<all_urls>') return /^(https?|ftp|file):/i.test(url);
  const m = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, schemeRaw, hostRaw, pathRaw] = m;
  if (!schemeRaw || !hostRaw || !pathRaw) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const scheme = u.protocol.replace(':', '');
  if (schemeRaw !== '*' && schemeRaw !== scheme) return false;
  if (hostRaw !== '*') {
    if (hostRaw.startsWith('*.')) {
      const suffix = hostRaw.slice(2);
      if (u.hostname !== suffix && !u.hostname.endsWith('.' + suffix)) return false;
    } else if (u.hostname !== hostRaw) {
      return false;
    }
  }
  const pathRe = new RegExp(
    '^' + pathRaw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );
  if (!pathRe.test(u.pathname + u.search)) return false;
  return true;
}
