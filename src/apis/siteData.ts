// src/apis/siteData.ts
//
// SiteDataManager — per-origin data clearing.
//
// Drives the address-bar lock-icon "Clear site data" UX, the
// hard-cache-reset variant of refresh, and the real implementation of
// `chrome.browsingData.*` host handlers.
//
// What we can clear PER ORIGIN:
//   - Cookies            : iterate CookieJar, delete entries whose
//                          domain matches the target host.
//   - localStorage       : iterate keys, remove those prefixed with
//                          `${host}@` (Scramjet's namespace).
//   - sessionStorage     : same prefix scheme.
//   - HTTP cache         : tag-based eviction via Scramjet's
//                          ScramjetClient cache plugin OR by
//                          bumping a "cache epoch" on the next nav
//                          (forces revalidation). We use both —
//                          tag eviction if the plugin is loaded,
//                          plus an explicit query-string buster on
//                          the next navigation.
//   - In-flight requests : not selectively clearable; leave alone.
//
// What's GLOBAL (can't be cleared per-origin without losing data):
//   - IndexedDB          : NOT namespaced by Scramjet — the underlying
//                          IndexedDB instance is shared with the host
//                          page. We refuse to clear it per-origin to
//                          avoid breaking DDX's own DBs (history,
//                          bookmarks, etc.). `clearAll()` is OK if
//                          the caller is explicit about wanting it.
//   - Cache Storage      : not rewritten by Scramjet (proxied pages
//                          can't register their own SW).
//   - Service Workers    : owned by the host's Scramjet SW; no per-
//                          origin worker registrations exist.
//
// PUBLIC API:
//   const m = SiteDataManager.getInstance();
//   await m.clearCookies('example.com');
//   await m.clearStorage('example.com');
//   await m.clearCache('example.com');
//   await m.clearAll('example.com'); // wraps cookies + storage + cache
//   await m.clearAllSites();         // wipe everything (browsingData.remove all=true)
//
// Returns an object with per-category counts so UI can show "Cleared 3
// cookies, 2 localStorage keys, marked cache stale".

import type { CookieAccessor } from './data/cookies';

export interface SiteClearResult {
  cookies: number;
  localStorageKeys: number;
  sessionStorageKeys: number;
  /** Whether the HTTP cache was tagged stale for the origin. */
  cacheBusted: boolean;
}

export interface SiteDataManagerConfig {
  cookieAccessor?: CookieAccessor;
}

/**
 * Singleton site-data manager. Stays cookie/storage-aware via
 * dependency injection from the boot path; falls back to lookups
 * via window globals when the deps aren't supplied yet.
 */
export class SiteDataManager {
  private static instance: SiteDataManager | null = null;

  public static getInstance(config: SiteDataManagerConfig = {}): SiteDataManager {
    if (!SiteDataManager.instance) {
      SiteDataManager.instance = new SiteDataManager(config);
    }
    return SiteDataManager.instance;
  }

  /**
   * Per-origin cache-buster epochs. When `clearCache(origin)` is
   * called we bump the epoch; the next navigation to that origin
   * appends `?__ddxCacheBuster=epoch` to bypass any prior cached
   * response. Bumped epochs ALSO clear the in-memory ScramjetClient
   * cache for that origin if the cache plugin is present.
   */
  private cacheEpochByHost = new Map<string, number>();

  private cookieAccessor: CookieAccessor | null;

  constructor(config: SiteDataManagerConfig = {}) {
    this.cookieAccessor = config.cookieAccessor ?? null;
  }

  /** Inject the cookie accessor post-construction (lifecycle reason). */
  setCookieAccessor(accessor: CookieAccessor): void {
    this.cookieAccessor = accessor;
  }

  /** Read the current cache-buster epoch for an origin (0 if unset). */
  getCacheEpoch(host: string): number {
    return this.cacheEpochByHost.get(this.normalizeHost(host)) ?? 0;
  }

  /**
   * Clear cookies for a host. Matches the host AND any parent-domain
   * cookies (e.g. clearing `mail.example.com` also drops `.example.com`
   * cookies). Returns the count of cookies removed.
   */
  async clearCookies(originOrHost: string): Promise<number> {
    const host = this.normalizeHost(originOrHost);
    if (!host) return 0;
    const accessor = this.cookieAccessor;
    if (!accessor) return 0;
    // CookieAccessor's filter supports `domain` (matches the cookie's
    // domain OR any parent). We can't directly delete via accessor
    // (it has no per-host clear), so list + remove individually.
    const cookies = await accessor.getCookies({ domain: host });
    let removed = 0;
    for (const c of cookies) {
      try {
        const url =
          (c.secure ? 'https://' : 'http://') + (c.domain.replace(/^\./, '')) + (c.path || '/');
        await accessor.removeCookie({ url, name: c.name, storeId: c.storeId });
        removed++;
      } catch (err) {
        console.warn('[SiteDataManager] cookie remove failed:', err);
      }
    }
    return removed;
  }

  /**
   * Clear localStorage + sessionStorage entries for an origin.
   * Scramjet namespaces both with `${host}@` prefix so we iterate
   * and remove matching keys.
   */
  async clearStorage(originOrHost: string): Promise<{ local: number; session: number }> {
    const host = this.normalizeHost(originOrHost);
    if (!host) return { local: 0, session: 0 };
    const local = this.clearNamespacedStorage(window.localStorage, host);
    const session = this.clearNamespacedStorage(window.sessionStorage, host);
    return { local, session };
  }

  private clearNamespacedStorage(store: Storage, host: string): number {
    const prefix = host + '@';
    const toRemove: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) {
      try { store.removeItem(key); } catch { /* swallow */ }
    }
    return toRemove.length;
  }

  /**
   * Bump the per-host cache epoch and (best-effort) invalidate any
   * Scramjet HTTP cache entries for that host. Returns true on
   * success.
   */
  async clearCache(originOrHost: string): Promise<boolean> {
    const host = this.normalizeHost(originOrHost);
    if (!host) return false;
    const prior = this.cacheEpochByHost.get(host) ?? 0;
    this.cacheEpochByHost.set(host, prior + 1);
    // Best-effort: invalidate Scramjet cache plugin storage if loaded.
    // The plugin keys entries by URL; we walk and drop matching ones.
    try {
      const cachePlugin = (window as { __scramjetHttpCache?: { clearForHost?: (h: string) => void } }).__scramjetHttpCache;
      cachePlugin?.clearForHost?.(host);
    } catch { /* swallow */ }
    return true;
  }

  /**
   * Convenience: clear cookies + storage + cache for one origin.
   * Returns aggregated counts.
   */
  async clearAll(originOrHost: string): Promise<SiteClearResult> {
    const host = this.normalizeHost(originOrHost);
    if (!host) {
      return { cookies: 0, localStorageKeys: 0, sessionStorageKeys: 0, cacheBusted: false };
    }
    const [cookies, storage, cacheBusted] = await Promise.all([
      this.clearCookies(host),
      this.clearStorage(host),
      this.clearCache(host),
    ]);
    return {
      cookies,
      localStorageKeys: storage.local,
      sessionStorageKeys: storage.session,
      cacheBusted,
    };
  }

  /**
   * Wipe ALL site data (cookies, ALL namespaced localStorage/sessionStorage,
   * ALL cache). Used by `chrome.browsingData.remove({}, {cookies, ...})`.
   *
   * We DELIBERATELY do NOT wipe unrelated DDX keys (those without an
   * `@` namespace, e.g. theme settings) — only the per-origin entries.
   */
  async clearAllSites(): Promise<{ cookies: number; localStorageKeys: number; sessionStorageKeys: number }> {
    // Cookies: nuke entirely via the underlying jar's clear().
    let cookies = 0;
    const accessor = this.cookieAccessor;
    try {
      // Use getCookies({}) + remove loop to count + emit per-cookie events.
      if (accessor) {
        const all = await accessor.getCookies({});
        cookies = all.length;
        // Best-effort: try to hit the jar directly for one-shot clear.
        // Falls back to per-cookie remove if the jar shape doesn't
        // expose a clear() (or if accessor doesn't expose its proxy).
        const accessorAny = accessor as unknown as {
          proxy?: { getCookieJar?: () => { clear?: () => void } | null };
        };
        const jar = accessorAny.proxy?.getCookieJar?.();
        if (jar?.clear) {
          jar.clear();
        } else {
          for (const c of all) {
            try {
              const url =
                (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + (c.path || '/');
              await accessor.removeCookie({ url, name: c.name, storeId: c.storeId });
            } catch { /* swallow */ }
          }
        }
      }
    } catch (err) {
      console.warn('[SiteDataManager] clearAllSites cookies failed:', err);
    }

    const localKeys = this.clearAllNamespaced(window.localStorage);
    const sessionKeys = this.clearAllNamespaced(window.sessionStorage);
    this.cacheEpochByHost.clear();
    return { cookies, localStorageKeys: localKeys, sessionStorageKeys: sessionKeys };
  }

  private clearAllNamespaced(store: Storage): number {
    const toRemove: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      // Scramjet's namespace pattern is `${host}@${origKey}`. Any
      // key containing '@' that isn't a DDX-internal key qualifies.
      // We require host to look like a host (contains '.' OR is
      // 'localhost') to avoid eating legitimate '@' keys (e.g.
      // email-formatted keys some libs use as identifiers).
      if (!key || !key.includes('@')) continue;
      const at = key.indexOf('@');
      const maybeHost = key.slice(0, at);
      if (maybeHost.includes('.') || maybeHost === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(maybeHost)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      try { store.removeItem(key); } catch { /* swallow */ }
    }
    return toRemove.length;
  }

  /**
   * Accept either a full URL (`https://example.com/foo`) or a bare
   * host (`example.com`). Returns the lowercased host, or '' on
   * unparseable input.
   */
  private normalizeHost(input: string): string {
    if (!input) return '';
    try {
      const u = new URL(input);
      return u.hostname.toLowerCase();
    } catch {
      // Not a URL — treat as host.
      return input.toLowerCase().replace(/^\.+/, '');
    }
  }
}
