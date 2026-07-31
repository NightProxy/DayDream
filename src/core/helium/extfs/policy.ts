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

  if (Array.isArray(manifest.host_permissions)) {
    for (const p of manifest.host_permissions) {
      if (typeof p === 'string') out.push(p);
    }
  }

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
  if (url.hostname.endsWith('.ddx')) return true;

  for (const pattern of compiledHostPatterns) {
    if (matchUrlPattern(pattern, url.toString())) return true;
  }

  const ec = (ctx.manifest as ChromeManifest).externally_connectable;
  if (ec && Array.isArray(ec.ids)) {
    if (ec.ids.includes('*')) return true;
    const host = url.hostname;
    if (host.endsWith('.ddx')) {
      const peer = host.slice(0, -'.ddx'.length);
      if (ec.ids.includes(peer)) return true;
    }
  }

  return false;
}
