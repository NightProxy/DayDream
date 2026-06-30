
import { SettingsAPI } from './settings';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionGrant {
  origin: string;
  name: string;
  state: PermissionState;
  /** When the user last set this state, epoch ms. */
  updatedAt: number;
  /** True if grant is session-only (cleared on browser close). */
  temporary?: boolean;
}

export interface SitePermissionsConfig {
  storageKey?: string;
}

export class SitePermissionsStore {
  private static instance: SitePermissionsStore | null = null;

  public static getInstance(config: SitePermissionsConfig = {}): SitePermissionsStore {
    if (!SitePermissionsStore.instance) {
      SitePermissionsStore.instance = new SitePermissionsStore(config);
    }
    return SitePermissionsStore.instance;
  }

  private readonly storageKey: string;
  private readonly store: SettingsAPI;
  private grants: Map<string, PermissionGrant[]> = new Map();
  /** Session-only grants — not persisted; cleared at boot. */
  private sessionGrants: Map<string, PermissionGrant[]> = new Map();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly changeListeners = new Set<(g: PermissionGrant) => void>();

  constructor(config: SitePermissionsConfig = {}) {
    this.storageKey = config.storageKey ?? 'sitePermissions';
    this.store = new SettingsAPI('/data/sitePermissions.json', '/data');
  }

  addChangeListener(fn: (g: PermissionGrant) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  private emit(grant: PermissionGrant): void {
    for (const fn of this.changeListeners) {
      try { fn(grant); } catch (err) { console.warn('[sitePerms] listener threw:', err); }
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) { await this.loadPromise; return; }
    this.loadPromise = this.loadFromStorage();
    try { await this.loadPromise; } finally { this.loadPromise = null; }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const raw = await this.store.getItem<PermissionGrant[]>(this.storageKey);
      if (Array.isArray(raw)) {
        for (const g of raw) {
          if (!g?.origin || !g?.name) continue;
          let arr = this.grants.get(g.origin);
          if (!arr) { arr = []; this.grants.set(g.origin, arr); }
          arr.push({
            origin: g.origin,
            name: g.name,
            state: g.state === 'granted' || g.state === 'denied' ? g.state : 'prompt',
            updatedAt: Number(g.updatedAt) || Date.now(),
          });
        }
      }
    } catch (err) {
      console.warn('[sitePerms] loadFromStorage failed:', err);
    } finally {
      this.loaded = true;
    }
  }

  private enqueueWrite(): void {
    this.writeQueue = this.writeQueue.then(() => this.saveToStorage());
  }

  private async saveToStorage(): Promise<void> {
    try {
      const flat: PermissionGrant[] = [];
      for (const arr of this.grants.values()) flat.push(...arr);
      await this.store.setItem(this.storageKey, flat);
    } catch (err) {
      console.warn('[sitePerms] saveToStorage failed:', err);
    }
  }

  /**
   * Look up the state for an (origin, name). Returns 'prompt' if no
   * grant exists. Session-only grants (set with `temporary:true`)
   * are checked first.
   */
  async getState(origin: string, name: string): Promise<PermissionState> {
    await this.ensureLoaded();
    const o = this.normalizeOrigin(origin);
    if (!o) return 'prompt';
    const sess = this.sessionGrants.get(o)?.find((g) => g.name === name);
    if (sess) return sess.state;
    const grant = this.grants.get(o)?.find((g) => g.name === name);
    return grant?.state ?? 'prompt';
  }

  /**
   * Persist a permission decision. Session-only grants don't write
   * to storage but ARE visible to subsequent getState calls.
   */
  async setState(
    origin: string,
    name: string,
    state: PermissionState,
    opts: { temporary?: boolean } = {},
  ): Promise<void> {
    const o = this.normalizeOrigin(origin);
    if (!o) return;
    const grant: PermissionGrant = {
      origin: o,
      name,
      state,
      updatedAt: Date.now(),
      ...(opts.temporary ? { temporary: true } : {}),
    };
    const target = opts.temporary ? this.sessionGrants : this.grants;
    let arr = target.get(o);
    if (!arr) { arr = []; target.set(o, arr); }
    const idx = arr.findIndex((g) => g.name === name);
    if (idx >= 0) arr[idx] = grant;
    else arr.push(grant);
    if (!opts.temporary) {
      await this.ensureLoaded();
      this.enqueueWrite();
    }
    this.emit(grant);
  }

  /** List all grants for an origin (for the lock-icon dropdown). */
  async listForOrigin(origin: string): Promise<PermissionGrant[]> {
    await this.ensureLoaded();
    const o = this.normalizeOrigin(origin);
    if (!o) return [];
    const persist = this.grants.get(o) ?? [];
    const session = this.sessionGrants.get(o) ?? [];
    return [...persist, ...session];
  }

  /** List all grants (for a settings page). */
  async listAll(): Promise<PermissionGrant[]> {
    await this.ensureLoaded();
    const out: PermissionGrant[] = [];
    for (const arr of this.grants.values()) out.push(...arr);
    return out;
  }

  /** Clear all grants for an origin (lock-icon "Reset permissions"). */
  async clearForOrigin(origin: string): Promise<void> {
    const o = this.normalizeOrigin(origin);
    if (!o) return;
    await this.ensureLoaded();
    if (this.grants.delete(o)) this.enqueueWrite();
    this.sessionGrants.delete(o);
  }

  /** Wipe everything (used by chrome.browsingData / Reset DDX). */
  async clearAll(): Promise<void> {
    await this.ensureLoaded();
    this.grants.clear();
    this.sessionGrants.clear();
    this.enqueueWrite();
  }

  private normalizeOrigin(input: string): string {
    if (!input) return '';
    try {
      const u = new URL(input);
      return u.origin.toLowerCase();
    } catch {
      const h = input.toLowerCase().replace(/^\.+/, '');
      return h ? `https://${h}` : '';
    }
  }
}
