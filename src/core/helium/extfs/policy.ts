import type {
  ChromeManifest,
  FirefoxManifest,
} from '../shared/unpack/types';
import type { ExtensionContext } from './types';
import { matchUrlPattern } from './war';

/**
 * Compile manifest host patterns (MV3 `host_permissions` and MV2
 * `permissions` URL entries) to a flat list of pattern strings.
 * Returns a stable list used by `isAllowedExternalOrigin`.
 */
export function compileHostPatterns(
  manifest: ChromeManifest | FirefoxManifest,
): string[] {
  const out: string[] = [];

  // MV3.
  if (Array.isArray(manifest.host_permissions)) {
    for (const p of manifest.host_permissions) {
      if (typeof p === 'string') out.push(p);
    }
  }

  // MV2: `permissions` may mix API tokens (e.g. "tabs") with URL
  // patterns ("https://*/*"). Filter to URL-pattern-looking entries.
  if (Array.isArray(manifest.permissions)) {
    for (const p of manifest.permissions) {
      if (typeof p !== 'string') continue;
      if (p === '<all_urls>' || /^[a-z*]+:\/\//.test(p)) {
        out.push(p);
      }
    }
  }

  return out;
}

/**
 * Decide whether the extension may fetch this external URL.
 *
 * Rules:
 *   1. If the URL host is `<id>.ddx` for any installed extension
 *      (including this one), allow — the plugin's `serveFile` /
 *      neighbour-extension-WAR handles the actual access decision.
 *      We don't filter same-TLD URLs here.
 *   2. Walk the compiled host patterns. Any match → allow.
 *   3. Walk `externally_connectable.ids`: if the URL host is
 *      `<other-id>.ddx` and the manifest lists `<other-id>` (or
 *      `*`), allow.
 *   4. Default deny.
 *
 * The plugin's host frame's initial navigation
 * (`frame.go('https://<id>.ddx/...')`) is not subject to this
 * policy — that's an inbound navigation, not an outbound fetch.
 */
export function isAllowedExternalOrigin(
  url: URL,
  ctx: ExtensionContext,
  compiledHostPatterns: string[],
): boolean {
  // Rule 1: any *.ddx host — let downstream WAR decide.
  if (url.hostname.endsWith('.ddx')) return true;

  // Rule 2: manifest host patterns.
  for (const pattern of compiledHostPatterns) {
    if (matchUrlPattern(pattern, url.toString())) return true;
  }

  // Rule 3: externally_connectable.ids (cross-extension messaging).
  const ec = (ctx.manifest as ChromeManifest).externally_connectable;
  if (ec && Array.isArray(ec.ids)) {
    if (ec.ids.includes('*')) return true;
    // This path is mostly a no-op when the URL isn't *.ddx (rule 1
    // already returned true for those). Kept for future cases where
    // an extension talks to a non-.ddx peer via the ids list.
    const host = url.hostname;
    if (host.endsWith('.ddx')) {
      const peer = host.slice(0, -'.ddx'.length);
      if (ec.ids.includes(peer)) return true;
    }
  }

  return false;
}
