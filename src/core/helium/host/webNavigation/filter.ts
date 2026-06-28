// src/core/helium/host/webNavigation/filter.ts
//
// Chrome event filter evaluator. Supports {url: [filterCondition[]]}
// per https://developer.chrome.com/docs/extensions/reference/api/events#filtered.

export interface UrlFilter {
  hostContains?: string;
  hostEquals?: string;
  hostPrefix?: string;
  hostSuffix?: string;
  pathContains?: string;
  pathEquals?: string;
  pathPrefix?: string;
  pathSuffix?: string;
  urlContains?: string;
  urlEquals?: string;
  urlPrefix?: string;
  urlSuffix?: string;
  urlMatches?: string;
  originAndPathMatches?: string;
  schemes?: string[];
  ports?: Array<number | [number, number]>;
}

export interface EventFilter {
  url?: UrlFilter[];
}

export function matchesEventFilter(filter: EventFilter | undefined, url: string): boolean {
  if (!filter?.url || filter.url.length === 0) return true;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  return filter.url.some((cond) => matchUrlCondition(cond, u, url));
}

function matchUrlCondition(c: UrlFilter, u: URL, full: string): boolean {
  if (c.hostContains && !u.hostname.includes(c.hostContains)) return false;
  if (c.hostEquals && u.hostname !== c.hostEquals) return false;
  if (c.hostPrefix && !u.hostname.startsWith(c.hostPrefix)) return false;
  if (c.hostSuffix && !u.hostname.endsWith(c.hostSuffix)) return false;
  if (c.pathContains && !u.pathname.includes(c.pathContains)) return false;
  if (c.pathEquals && u.pathname !== c.pathEquals) return false;
  if (c.pathPrefix && !u.pathname.startsWith(c.pathPrefix)) return false;
  if (c.pathSuffix && !u.pathname.endsWith(c.pathSuffix)) return false;
  if (c.urlContains && !full.includes(c.urlContains)) return false;
  if (c.urlEquals && full !== c.urlEquals) return false;
  if (c.urlPrefix && !full.startsWith(c.urlPrefix)) return false;
  if (c.urlSuffix && !full.endsWith(c.urlSuffix)) return false;
  if (c.urlMatches) {
    try { if (!new RegExp(c.urlMatches).test(full)) return false; } catch { return false; }
  }
  if (c.originAndPathMatches) {
    try {
      if (!new RegExp(c.originAndPathMatches).test(u.origin + u.pathname)) return false;
    } catch { return false; }
  }
  if (c.schemes && c.schemes.length > 0) {
    const s = u.protocol.replace(':', '');
    if (!c.schemes.includes(s)) return false;
  }
  if (c.ports && c.ports.length > 0) {
    const p = parseInt(u.port || (u.protocol === 'https:' ? '443' : '80'), 10);
    const matches = c.ports.some((portSpec) => {
      if (Array.isArray(portSpec)) {
        const [lo, hi] = portSpec;
        return p >= lo && p <= hi;
      }
      return p === portSpec;
    });
    if (!matches) return false;
  }
  return true;
}
