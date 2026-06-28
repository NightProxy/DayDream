// src/core/helium/host/i18n/negotiate.ts
//
// Locale negotiation: walk navigator.languages, look for matching
// _locales/<locale>/messages.json in extfs, fall back to default_locale.
//
// Two access patterns:
//   - `negotiateLocale(extId)` + `loadMessages(extId, locale)`: async,
//     hit the OPFS-backed extfs each time. Used for occasional RPC
//     handlers (chrome.i18n.getMessage if anyone DID call it via the
//     channel).
//   - `prepareI18nFor(extId, manifest)`: async, runs once per extension
//     lifetime; subsequently `getCachedI18n(extId)` returns the locale
//     + messages synchronously. Used by `extfs/plugin.ts` to bake the
//     messages into the on-wire `<meta name="helium-ctx">` payload
//     (the bootstrap needs them to provide a synchronous
//     `chrome.i18n.getMessage`, matching Chrome's contract).

// Direct import from `install.ts` rather than the `../../extfs`
// barrel: the barrel re-exports `HeliumExtensionPlugin`, and
// `extfs/plugin.ts` now imports `prepareI18nFor` from this file. Going
// through the barrel would create a module-init cycle. The barrel
// path is fine for everything else; this is the only edge.
import { readExtensionFile } from '../../extfs/install';

const localeCache = new Map<string, string | null>();
const messagesCache = new Map<string, Record<string, MessageEntry>>();
const preparedCache = new Map<string, PreparedI18n>();

export interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

export interface PreparedI18n {
  locale: string | null;
  messages: Record<string, MessageEntry>;
}

export async function negotiateLocale(extId: string, defaultLocale?: string): Promise<string | null> {
  const cached = localeCache.get(extId);
  if (cached !== undefined) return cached;

  const langs = typeof navigator !== 'undefined' ? [...navigator.languages, navigator.language] : ['en'];
  const candidates = [...langs, defaultLocale]
    .filter((s): s is string => typeof s === 'string')
    .flatMap((l) => {
      // Try the literal tag first (e.g. "en-US"), then the base
      // language ("en"). Also try Chrome's underscore convention
      // since `_locales/` directories use underscores while
      // `navigator.languages` uses hyphens.
      const variants: string[] = [l, l.replace(/-/g, '_')];
      const base = l.split('-')[0];
      if (base && base !== l) variants.push(base);
      return variants;
    });

  for (const candidate of candidates) {
    try {
      const bytes = await readExtensionFile(extId, `_locales/${candidate}/messages.json`);
      if (bytes) {
        localeCache.set(extId, candidate);
        return candidate;
      }
    } catch { /* try next */ }
  }

  if (defaultLocale) {
    localeCache.set(extId, defaultLocale);
    return defaultLocale;
  }

  localeCache.set(extId, null);
  return null;
}

export async function loadMessages(
  extId: string,
  locale: string,
): Promise<Record<string, MessageEntry>> {
  const key = `${extId}::${locale}`;
  const cached = messagesCache.get(key);
  if (cached) return cached;
  try {
    const bytes = await readExtensionFile(extId, `_locales/${locale}/messages.json`);
    if (!bytes) {
      messagesCache.set(key, {});
      return {};
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, MessageEntry>;
    messagesCache.set(key, parsed);
    return parsed;
  } catch {
    messagesCache.set(key, {});
    return {};
  }
}

/**
 * Resolve the negotiated locale + load its messages, and remember
 * the result on a per-extension basis so subsequent iframe boots
 * are zero-RTT. Returns the prepared payload directly.
 *
 * Idempotent. Safe to call from spawn/popup-open/devtools-open paths
 * — first call does the work, subsequent calls hit the cache.
 */
export async function prepareI18nFor(
  extId: string,
  defaultLocale: string | undefined,
): Promise<PreparedI18n> {
  const cached = preparedCache.get(extId);
  if (cached) return cached;
  const locale = await negotiateLocale(extId, defaultLocale);
  const messages = locale ? await loadMessages(extId, locale) : {};
  const prepared: PreparedI18n = { locale, messages };
  preparedCache.set(extId, prepared);
  return prepared;
}

/**
 * Synchronous accessor. Returns null if `prepareI18nFor` hasn't been
 * awaited yet. Used by `extfs/plugin.ts` to inject the messages
 * directly into served HTML — the plugin's handler is async but the
 * fastest path is when prepareI18nFor was already kicked off at spawn
 * time and has resolved by the time the first HTML request lands.
 */
export function getCachedI18n(extId: string): PreparedI18n | null {
  return preparedCache.get(extId) ?? null;
}

/**
 * Drop all cached state for an extension. Called from
 * ExtensionManager.kill() so reloads pick up locale changes (e.g.
 * the user changed navigator.language between sessions).
 */
export function invalidateI18nFor(extId: string): void {
  localeCache.delete(extId);
  preparedCache.delete(extId);
  for (const k of Array.from(messagesCache.keys())) {
    if (k.startsWith(`${extId}::`)) messagesCache.delete(k);
  }
}
