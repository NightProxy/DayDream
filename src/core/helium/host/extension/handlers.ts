// src/core/helium/host/extension/handlers.ts
//
// chrome.extension.* host handlers (Task 34, MV2 surface).
//
// chrome.extension.* is the legacy MV2 namespace for extension
// introspection. Most of it has been superseded by chrome.runtime
// in MV3, but extensions in the wild still ship MV2 background
// pages that call chrome.extension.getBackgroundPage(),
// chrome.extension.getViews(), and chrome.extension.getURL().
//
// Coverage (per spec §27 + Tier 1-3 plan Task 34):
//   - getBackgroundPage  — MV2-only; throws under MV3 (use
//                          chrome.runtime.getBackgroundPage instead)
//   - getViews           — v1: only the background page's
//                          contentWindow is tracked; popup/devtools/tab
//                          views are TODO (see inline comment).
//   - getURL             — same as chrome.runtime.getURL; always
//                          `https://<id>.ddx/<path>`.
//   - isAllowedIncognitoAccess  — false (no private browsing yet).
//   - isAllowedFileSchemeAccess — false (no file:// scheme in DDX).
//
// All handlers are async to match the host RPC contract; the
// in-iframe shim awaits them via the bootstrap channel.

import type { ExtensionContext } from '../../extfs/types';

/**
 * Subset of ExtensionManager exposed to ExtensionHandlers. Defined
 * here so the host module doesn't depend on the full manager type.
 * Mirrors the pattern used by RuntimeHostDeps in host/runtime.
 */
export interface ExtensionHostDeps {
  getSpawnedById: (id: string) => { ctx: ExtensionContext; iframe: HTMLIFrameElement } | undefined;
  /**
   * Live registry of popup iframes for an extension. popupHost.ts
   * adds/removes entries via `registerPopupWindow` /
   * `unregisterPopupWindow` on ExtensionManager. Optional so older
   * callers without a popup registry remain valid.
   */
  getPopupWindows?: (extId: string) => Window[];
  /**
   * Live registry of devtools_page iframe contentWindows for an
   * extension. Backed by DevtoolsPageHost. Optional for the same
   * reason as `getPopupWindows`.
   */
  getDevtoolsWindows?: (extId: string) => Window[];
  /**
   * Tabs whose content represents the extension itself (i.e. tabs
   * opened with chrome.tabs.create({ url: 'chrome-extension://…' })).
   * v1: not tracked — caller may omit. Reserved for future extension.
   */
  getTabWindows?: (extId: string) => Window[];
}

export class ExtensionHandlers {
  constructor(private readonly deps: ExtensionHostDeps) {}

  /**
   * MV2 only — returns the background iframe's contentWindow.
   *
   * Notes:
   *   - Returns `null` if the extension isn't spawned (matches Chrome's
   *     behaviour when called before the background page boots).
   *   - Wrapper in the iframe sees a real Window object — it can read
   *     globals defined by the BG. Cross-realm property access works
   *     because both frames are same-origin under the synthetic
   *     `<id>.ddx` host.
   *   - MV3 throws — extensions should use
   *     `chrome.runtime.getBackgroundPage` (which itself throws under
   *     MV3 service workers, but provides a saner error message).
   */
  getBackgroundPage = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<Window | null> => {
    if (ctx.manifestVersion !== 2) {
      throw new Error(
        'chrome.extension.getBackgroundPage is MV2 only; use chrome.runtime.getBackgroundPage in MV3',
      );
    }
    const s = this.deps.getSpawnedById(ctx.id);
    return s?.iframe.contentWindow ?? null;
  };

  /**
   * Returns Window objects for views matching the filter.
   *
   * Filter semantics (from Chrome docs):
   *   - `type: 'background' | 'popup' | 'tab' | 'devtools'`
   *   - `windowId`: limit to a specific browser window (ignored —
   *     Helium does not have multiple browser windows yet).
   *   - No `type` → return every known view for the extension
   *     (background + popups + devtools_pages).
   *
   * View sources:
   *   - background: the BG iframe owned by ExtensionManager.
   *   - popup:      `deps.getPopupWindows(extId)` — populated by
   *                 popupHost.ts via ExtensionManager.registerPopupWindow.
   *   - devtools:   `deps.getDevtoolsWindows(extId)` — populated by
   *                 DevtoolsPageHost.spawn / despawn.
   *   - tab:        `deps.getTabWindows(extId)` — reserved for future
   *                 use; v1 does not track extension-URL tabs.
   */
  getViews = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<Window[]> => {
    const opts = (args[0] ?? {}) as { type?: string; windowId?: number };
    void opts.windowId; // not honoured in v1 (single-window)
    const out: Window[] = [];

    const wantAll = opts.type === undefined;
    if (wantAll || opts.type === 'background') {
      const s = this.deps.getSpawnedById(ctx.id);
      const w = s?.iframe.contentWindow ?? null;
      if (w) out.push(w);
    }
    if (wantAll || opts.type === 'popup') {
      out.push(...(this.deps.getPopupWindows?.(ctx.id) ?? []));
    }
    if (wantAll || opts.type === 'devtools') {
      out.push(...(this.deps.getDevtoolsWindows?.(ctx.id) ?? []));
    }
    if (wantAll || opts.type === 'tab') {
      out.push(...(this.deps.getTabWindows?.(ctx.id) ?? []));
    }
    return out;
  };

  /**
   * Build a URL into the extension's synthetic origin. This is the
   * pre-MV3 way to reference a packaged file; in MV3 you'd use
   * `chrome.runtime.getURL`. Both paths produce identical results.
   *
   * The local in-iframe shim ChromeExtensionBase.getURL() (in
   * shared/api/extension.ts) is synchronous and resolves without a
   * round-trip; this host method is kept for the RPC parity case
   * where a non-iframe caller (e.g. devtools_page) needs it.
   */
  getURL = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    const path = String(args[0] ?? '').replace(/^\/+/, '');
    return `https://${ctx.origin}/${path}`;
  };

  /**
   * Helium does not have an incognito mode (no private browsing
   * partition). Always false.
   */
  isAllowedIncognitoAccess = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<boolean> => false;

  /**
   * Helium serves extensions over a synthetic https origin; there is
   * no file:// scheme exposed to the extension. Always false.
   */
  isAllowedFileSchemeAccess = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<boolean> => false;
}
