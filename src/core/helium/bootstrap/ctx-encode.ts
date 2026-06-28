import type { ExtensionContext } from '../extfs/types';

/**
 * Encode an ExtensionContext for inclusion in an HTML <meta> tag.
 *
 * The output is base64 of UTF-8-encoded JSON. The
 * unescape(encodeURIComponent(...)) dance handles non-ASCII characters
 * in manifest fields (e.g., localized extension names with CJK or
 * emoji) without atob() throwing on out-of-range code points.
 */
export function serializeCtxForMeta(ctx: ExtensionContext): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(ctx))));
}

/**
 * Decode an ExtensionContext from a <meta> tag's content attribute.
 * Inverse of serializeCtxForMeta. Throws on malformed input.
 */
export function parseCtxFromMeta(metaContent: string): ExtensionContext {
  return JSON.parse(decodeURIComponent(escape(atob(metaContent))));
}
