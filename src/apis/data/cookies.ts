// src/apis/data/cookies.ts
//
// chrome.cookies.* backing implementation over Scramjet's CookieJar.
//
// CookieJar (scramjet/packages/core/src/shared/cookie.ts) shape:
//   - Internal storage: Record<id, Cookie> keyed by `${domain}@${path}@${name}`
//     where domain ALWAYS starts with a leading "." (host-only cookies have
//     `hostOnly: true` set explicitly).
//   - Cookie fields: name, value, path?, expires? (epoch ms number),
//     maxAge?, domain?, hostOnly?, secure?, httpOnly?, sameSite?.
//   - `dump()`        → `JSON.stringify(cookies)` of the Record above.
//   - `load(str)`     → consumes the same JSON object format.
//   - `setCookies(setCookieHeader, url)`  → parses a Set-Cookie header string
//                       (e.g. `name=value; Path=/; Secure; SameSite=Lax`).
//   - `getCookies(url, fromJs, sameSiteCtx)` → returns the `name=value; ...`
//                       Cookie header string; not useful for chrome.cookies.

import type { Proxy } from '@apis/proxy';

export interface DDXCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  session: boolean;
  expirationDate?: number;
  storeId: string;
}

export interface CookieFilter {
  url?: string;
  name?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  session?: boolean;
  storeId?: string;
}

export interface CookieSetOpts {
  url: string;
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  expirationDate?: number;
  storeId?: string;
}

// Mirror of scramjet's `Cookie` type (the actual stored shape). Kept loose
// because `dump()` is JSON, which may strip undefined fields.
interface ScramjetCookie {
  name?: string;
  value?: string;
  path?: string;
  expires?: number;          // epoch ms, or absent for session cookies
  maxAge?: number;
  domain?: string;           // always leading "." for non-hostOnly
  hostOnly?: boolean;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;         // "strict"|"lax"|"none" or Title-case variants
}

// Subset of CookieJar's public surface we actually invoke. Typed as a
// structural interface so we can swap in a mock in the sanity tests
// without depending on the scramjet build.
export interface CookieJarLike {
  dump(): string;
  setCookies(cookieHeader: string, url: URL): void;
}

export class CookieAccessor {
  constructor(private readonly proxy: Proxy) {}

  private getJar(): CookieJarLike {
    const j = this.proxy.getCookieJar();
    if (!j) throw new Error('CookieJar not available');
    return j as CookieJarLike;
  }

  /**
   * Pull every cookie currently stored in the jar by parsing its dump().
   * The dump format is `JSON.stringify(Record<id, Cookie>)`; we drop the
   * synthetic id key and return the cookie values.
   */
  private dumpToCookies(jar: CookieJarLike): ScramjetCookie[] {
    if (typeof jar.dump !== 'function') return [];
    let dumped: string;
    try {
      dumped = jar.dump();
    } catch (err) {
      console.warn('[helium/cookies] jar.dump() threw:', err);
      return [];
    }
    if (typeof dumped !== 'string' || dumped.length === 0) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(dumped);
    } catch (err) {
      console.warn('[helium/cookies] jar.dump() returned invalid JSON:', err);
      return [];
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }
    const out: ScramjetCookie[] = [];
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (v && typeof v === 'object') out.push(v as ScramjetCookie);
    }
    return out;
  }

  async getCookies(filter: CookieFilter): Promise<DDXCookie[]> {
    const jar = this.getJar();
    const all = this.dumpToCookies(jar);
    return all
      .filter((c) => this.matchesFilter(c, filter))
      .map((c) => this.toChromeCookie(c));
  }

  async setCookie(opts: CookieSetOpts): Promise<DDXCookie | null> {
    const jar = this.getJar();
    if (typeof jar.setCookies !== 'function') {
      throw new Error('CookieJar.setCookies unavailable');
    }
    const header = this.buildSetCookieHeader(opts);
    try {
      jar.setCookies(header, new URL(opts.url));
    } catch (err) {
      console.warn('[helium/cookies] setCookies failed:', err);
      return null;
    }
    const fetched = await this.getCookies({
      url: opts.url,
      ...(opts.name !== undefined ? { name: opts.name } : {}),
    });
    return fetched[0] ?? null;
  }

  async removeCookie(opts: {
    url: string;
    name: string;
    storeId?: string;
  }): Promise<{ url: string; name: string; storeId: string } | null> {
    const jar = this.getJar();
    if (typeof jar.setCookies !== 'function') return null;
    // Per RFC 6265 §3.1: setting Max-Age=0 expires the cookie immediately.
    // CookieJar.setCookies honors Max-Age<=0 by deleting the matching id.
    const setVal = `${opts.name}=; Max-Age=0; Path=/`;
    try {
      jar.setCookies(setVal, new URL(opts.url));
    } catch { /* ignore */ }
    return { url: opts.url, name: opts.name, storeId: opts.storeId ?? '0' };
  }

  private buildSetCookieHeader(opts: CookieSetOpts): string {
    const parts: string[] = [`${opts.name ?? ''}=${opts.value ?? ''}`];
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    parts.push(`Path=${opts.path ?? '/'}`);
    if (opts.secure) parts.push('Secure');
    if (opts.httpOnly) parts.push('HttpOnly');
    if (opts.sameSite === 'lax') parts.push('SameSite=Lax');
    else if (opts.sameSite === 'strict') parts.push('SameSite=Strict');
    else if (opts.sameSite === 'no_restriction') parts.push('SameSite=None');
    if (opts.expirationDate) {
      parts.push(`Expires=${new Date(opts.expirationDate * 1000).toUTCString()}`);
    }
    return parts.join('; ');
  }

  private matchesFilter(cookie: ScramjetCookie, filter: CookieFilter): boolean {
    if (filter.name && cookie.name !== filter.name) return false;
    if (filter.domain) {
      // Chrome semantics: filter.domain matches the cookie's domain or any
      // parent. Cookie domains in the jar are stored with a leading dot;
      // compare on the dot-stripped form.
      const cd = (cookie.domain ?? '').replace(/^\./, '');
      const fd = filter.domain.replace(/^\./, '');
      if (cd !== fd && !cd.endsWith('.' + fd)) return false;
    }
    if (filter.path && cookie.path !== filter.path) return false;
    if (filter.secure !== undefined && (cookie.secure === true) !== filter.secure) return false;
    if (filter.session !== undefined) {
      const isSession = cookie.expires === undefined;
      if (isSession !== filter.session) return false;
    }
    if (filter.url) {
      try {
        const u = new URL(filter.url);
        if (cookie.secure && u.protocol !== 'https:') return false;
        if (cookie.domain) {
          const cd = cookie.domain.replace(/^\./, '');
          if (cookie.hostOnly) {
            if (u.hostname !== cd) return false;
          } else {
            if (u.hostname !== cd && !u.hostname.endsWith('.' + cd)) return false;
          }
        }
        if (cookie.path && !u.pathname.startsWith(cookie.path)) return false;
      } catch { /* invalid url — ignore filter */ }
    }
    return true;
  }

  private toChromeCookie(c: ScramjetCookie): DDXCookie {
    const ssRaw = (c.sameSite ?? '').toLowerCase();
    let sameSite: DDXCookie['sameSite'] = 'unspecified';
    if (ssRaw === 'strict') sameSite = 'strict';
    else if (ssRaw === 'lax') sameSite = 'lax';
    else if (ssRaw === 'none') sameSite = 'no_restriction';

    // expires is an epoch-ms number in the live jar, but a JSON round-trip
    // through dump() preserves that. Accept legacy string/Date defensively.
    let expirationDate: number | undefined;
    const exp = c.expires as number | string | Date | undefined;
    if (exp !== undefined && exp !== null) {
      let t: number = NaN;
      if (typeof exp === 'number') t = exp;
      else if (exp instanceof Date) t = exp.getTime();
      else if (typeof exp === 'string') t = new Date(exp).getTime();
      if (Number.isFinite(t)) expirationDate = Math.floor(t / 1000);
    }

    // The jar stores `hostOnly` explicitly; trust that flag rather than
    // re-deriving it from the leading-dot domain convention.
    const hostOnly = c.hostOnly === true;
    // Chrome surfaces domains without the synthetic leading dot only for
    // host-only cookies; otherwise the leading dot is preserved.
    const rawDomain = c.domain ?? '';
    const domain = hostOnly ? rawDomain.replace(/^\./, '') : rawDomain;

    const out: DDXCookie = {
      name: c.name ?? '',
      value: c.value ?? '',
      domain,
      hostOnly,
      path: c.path ?? '/',
      secure: c.secure === true,
      httpOnly: c.httpOnly === true,
      sameSite,
      session: expirationDate === undefined,
      storeId: '0',
    };
    if (expirationDate !== undefined) out.expirationDate = expirationDate;
    return out;
  }
}
