import type {
  ChromeManifest,
  ExtensionFormat,
  FirefoxManifest,
} from '../shared/unpack/types';

/**
 * The runtime identity of an extension: its ID, manifest, parsed
 * version, and the synthetic origin under which it's served.
 * Threaded through every `Chrome*` namespace class so methods like
 * `chrome.runtime.id` and `chrome.runtime.getURL` can resolve.
 */
export interface ExtensionContext {
  id: string;
  manifestVersion: 2 | 3;
  manifest: ChromeManifest | FirefoxManifest;
  /** Synthetic host, e.g. `<id>.ddx`. No scheme. */
  origin: string;
  /**
   * Marks the iframe as a devtools_page host (i.e. the hidden iframe
   * spawned by DevtoolsPageHost). The bootstrap reads this flag from
   * the on-wire ctx (via the `<meta name="helium-ctx">` payload) and,
   * when true, additionally synthesizes `chrome.devtools.*` (panels,
   * inspectedWindow, network) on the chrome global. Regular BG /
   * popup / options iframes never get this flag.
   */
  inDevtools?: boolean;
  /**
   * For devtools_page iframes only. The numeric tabId of the tab
   * being inspected. Baked into helium-ctx so `chrome.devtools.
   * inspectedWindow.tabId` can be a SYNCHRONOUS read (matching real
   * Chrome's contract), not an RPC round-trip that returns a
   * Promise<number>. Extensions universally read `tabId` inline
   * like `chrome.tabs.sendMessage(chrome.devtools.inspectedWindow.
   * tabId, ...)` — async would break those patterns.
   */
  inspectedTabId?: number;
  /**
   * Optional preloaded i18n state. Populated by the per-iframe HTML
   * server (`extfs/plugin.ts`) just before it serializes the context
   * into `<meta name="helium-ctx">`. The bootstrap reads these fields
   * to provide a SYNCHRONOUS `chrome.i18n.getMessage` / `getUILanguage`
   * / `getAcceptLanguages` implementation that matches Chrome's
   * contract (real `chrome.i18n.getMessage` returns a string, not a
   * Promise — async via RPC would break the common
   * `el.textContent = chrome.i18n.getMessage(key)` pattern).
   *
   * Stored only on the on-wire copy that goes into the iframe — the
   * in-memory ExtensionContext held by ExtensionManager doesn't carry
   * the message map (extension memory footprint stays small).
   *
   * `i18nLocale` is the negotiated locale code (e.g. "en", "fr"). If
   * the extension ships no `_locales/`, this is null and
   * `i18nMessages` is `{}`.
   */
  i18nLocale?: string | null;
  i18nMessages?: Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;
}

/**
 * One entry in `/extensions/_index.json`. The index stores only
 * derived scalars; the source of truth for full manifest data is
 * the on-disk `/extensions/<id>/manifest.json`.
 */
export interface ExtensionIndexEntry {
  id: string;
  name: string;
  version: string;
  manifestVersion: 2 | 3;
  format: ExtensionFormat;
  idFromKey: boolean;
  installedAt: number;
  enabled: boolean;
}

/** Top-level shape of `/extensions/_index.json`. */
export interface ExtensionIndex {
  version: 1;
  extensions: ExtensionIndexEntry[];
}

/**
 * Output of `loadExtensionsAtBoot()` — what consumers (the next
 * sub-project's context-spawning layer) iterate to spawn frames.
 */
export interface LoadedExtension {
  entry: ExtensionIndexEntry;
  manifest: ChromeManifest | FirefoxManifest;
  context: ExtensionContext;
}
