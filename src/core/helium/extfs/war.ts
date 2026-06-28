import type {
  WebAccessibleResources,
} from '../shared/unpack/types';
import type { ExtensionContext } from './types';

/**
 * Compile a Chrome WAR glob (`*` matches any sequence of chars; all
 * other characters are literal) to an anchored regex. No `?` —
 * Chrome doesn't support it in WAR globs.
 */
function compileGlob(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchGlob(glob: string, value: string): boolean {
  return compileGlob(glob).test(value);
}

// Subset of Chrome match patterns:
//
//   <all_urls>             — anything
//   *://* /*               — any scheme + host + path  (no spaces)
//   https://* /*           — scheme-fixed, host-wild   (no spaces)
//   http://* /*            — same                       (no spaces)
//   https://<host>/*       — exact host
//   https://<host>/<p>     — exact host + path
//   https://*.example.com/* — host wildcard segment (one level only)
//
// Anything else (path globs, scheme arrays, etc.) logs a warning
// and returns false.
export function matchUrlPattern(pattern: string, url: string): boolean {
  if (pattern === '<all_urls>') return true;

  // Match pattern grammar: <scheme>://<host>/<path>
  const m = /^(\*|https?|wss?|ftp|file):\/\/([^/]+)(\/.*)?$/.exec(pattern);
  if (!m) {
    console.warn(`[helium/extfs/war] unsupported match pattern: ${pattern}`);
    return false;
  }
  const [, scheme, host, path = '/'] = m;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  const targetScheme = target.protocol.replace(/:$/, '');
  if (scheme !== '*' && scheme !== targetScheme) return false;

  // Host: `*` = any; `*.foo` = any subdomain of foo OR foo itself.
  if (host === '*') {
    // any host
  } else if (host.startsWith('*.')) {
    const rest = host.slice(2);
    if (target.hostname !== rest && !target.hostname.endsWith(`.${rest}`)) {
      return false;
    }
  } else {
    if (target.hostname !== host) return false;
  }

  // Path: literal or trailing `/*`.
  if (path === '/*' || path === '/') {
    if (path === '/' && target.pathname !== '/') return false;
    return true;
  }
  if (path.endsWith('/*')) {
    const prefix = path.slice(0, -2);
    return target.pathname.startsWith(prefix);
  }
  return target.pathname === path;
}

/**
 * Strip `.ddx` from a host to get the extension ID (or null).
 */
function extensionIdFromOrigin(originHost: string): string | null {
  if (!originHost.endsWith('.ddx')) return null;
  const id = originHost.slice(0, -'.ddx'.length);
  return /^[a-p]{32}$/.test(id) ? id : null;
}

/**
 * Decide whether a request for `<relPath>` is allowed under the
 * extension's `web_accessible_resources`.
 *
 * Same-origin requests (initiator host equals `ctx.origin`, or
 * initiator absent/unknown) are always allowed. Cross-origin
 * requests must match a WAR entry per MV2 string-array semantics
 * or MV3 object-form semantics.
 */
export function isAccessible(
  relPath: string,
  context: {
    parsed?: {
      // Scramjet's actual fetch-request context shape. Both
      // `fetchInitiatorOrigin` (string) and `clientUrl` (URL) are emitted
      // by the runtime; older code paths read `client.origin` which
      // doesn't exist and silently makes the check a no-op (every
      // request is treated as same-origin / unknown initiator and
      // allowed). Verified by reading scramjet.mjs and the working
      // companion path in src/core/helium/host/webRequest/events.ts.
      fetchInitiatorOrigin?: string;
      clientUrl?: { origin?: string };
      // Legacy fields read by older code. Kept as additional fallbacks
      // so a future scramjet version that re-exposes them still works.
      client?: { origin?: string };
      referrer?: { origin?: string };
    };
  },
  ctx: ExtensionContext,
): boolean {
  const ownOrigin = `https://${ctx.origin}`;
  const initiator =
    context.parsed?.fetchInitiatorOrigin ??
    context.parsed?.clientUrl?.origin ??
    context.parsed?.client?.origin ??
    context.parsed?.referrer?.origin;

  // Same-origin / unknown initiator: allow.
  if (!initiator || initiator === ownOrigin) return true;

  const war = ctx.manifest.web_accessible_resources as
    | WebAccessibleResources
    | undefined;
  if (!war) return false;

  // MV2 form: string[].
  if (Array.isArray(war) && war.every(e => typeof e === 'string')) {
    return (war as string[]).some(glob => matchGlob(glob, relPath));
  }

  // MV3 form: Array<{ resources, matches?, extension_ids? }>.
  if (Array.isArray(war)) {
    for (const entry of war as Array<{
      resources: string[];
      matches?: string[];
      extension_ids?: string[];
    }>) {
      const matched = entry.resources?.some(glob => matchGlob(glob, relPath));
      if (!matched) continue;

      // No restrictions → any origin allowed.
      if (!entry.matches && !entry.extension_ids) return true;

      if (entry.matches?.some(p => matchUrlPattern(p, initiator))) return true;

      if (entry.extension_ids?.includes('*')) return true;
      const initiatorHost = (() => {
        try {
          return new URL(initiator).hostname;
        } catch {
          return null;
        }
      })();
      const initiatorExtId = initiatorHost
        ? extensionIdFromOrigin(initiatorHost)
        : null;
      if (initiatorExtId && entry.extension_ids?.includes(initiatorExtId)) {
        return true;
      }
    }
  }

  return false;
}
