// src/core/helium/host/offscreen/handlers.ts
//
// `chrome.offscreen.*` host handlers.
//
// Chrome's contract: an MV3 extension can spawn ONE hidden DOM
// context at a time (an "offscreen document") to perform tasks that
// require a Document but don't fit in a service worker — DOM
// parsing, Web Audio, MediaRecorder, MathML, etc. The document is
// served from the extension's own origin and gets a full chrome.*
// surface.
//
// DDX impl: same as BG/popup/options — spawn a hidden Scramjet
// frame with HeliumExtensionPlugin and wire it through the standard
// auxiliary-view handshake (ExtensionManager.wireAuxiliaryViewChannel).
// The offscreen doc thus joins the extension's RPC mesh and can
// runtime.sendMessage to the BG without further work.

import type { ExtensionContext } from '../../extfs/types';

const OFFSCREEN_CONTAINER_ID = '__helium_offscreen_documents__';

export interface OffscreenDeps {
  /** Scramjet proxy. Used to construct the offscreen iframe's frame. */
  proxy: { createFrame: (el: HTMLIFrameElement, opts: { plugins: unknown[] }) => Promise<{ go: (url: string) => void }> };
  /** Construct a fresh HeliumExtensionPlugin bound to (extId, ctx). */
  createExtensionPlugin: (extId: string) => unknown;
  /** Standard channel + handshake wiring used by BG/popup/options. */
  wireAuxiliaryViewChannel: (
    ctx: ExtensionContext,
    iframe: HTMLIFrameElement,
    opts?: { isBackground: boolean },
  ) => unknown;
}

interface OffscreenEntry {
  url: string;
  iframe: HTMLIFrameElement;
}

export class OffscreenHandlers {
  // Chrome's rule: one offscreen doc per extension. Keyed by extId.
  private readonly docs = new Map<string, OffscreenEntry>();

  constructor(private readonly deps: OffscreenDeps) {}

  private ensureContainer(): HTMLDivElement {
    let el = document.getElementById(OFFSCREEN_CONTAINER_ID) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = OFFSCREEN_CONTAINER_ID;
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  createDocument = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const opts = (args[0] ?? {}) as {
      url?: string;
      reasons?: string[];
      justification?: string;
    };
    if (typeof opts.url !== 'string' || opts.url.length === 0) {
      throw new Error('chrome.offscreen.createDocument requires a url');
    }
    // Chrome's "only one at a time" rule. We could allow multiple
    // and re-key on full URL, but matching Chrome exactly avoids
    // surprises.
    if (this.docs.has(ctx.id)) {
      throw new Error('Only a single offscreen document may be created');
    }

    const container = this.ensureContainer();
    const iframe = document.createElement('iframe');
    iframe.dataset['heliumOffscreenExtId'] = ctx.id;
    iframe.style.display = 'none';

    const plugin = this.deps.createExtensionPlugin(ctx.id);
    if (!plugin) {
      throw new Error(`createDocument: no plugin for ${ctx.id}`);
    }

    // IMPORTANT ORDER: wire the channel BEFORE frame.go so the
    // handshake listener catches the load event. Same pattern as
    // popupHost.ts.
    this.deps.wireAuxiliaryViewChannel(ctx, iframe, { isBackground: false });

    let frame: { go: (url: string) => void };
    try {
      frame = await this.deps.proxy.createFrame(iframe, { plugins: [plugin] });
    } catch (err) {
      // Clean up the half-spawned iframe.
      try { iframe.remove(); } catch { /* ignore */ }
      throw err;
    }
    container.appendChild(iframe);

    const fullUrl = `https://${ctx.origin}/${opts.url.replace(/^\/+/, '')}`;
    frame.go(fullUrl);

    this.docs.set(ctx.id, { url: opts.url, iframe });
  };

  closeDocument = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<void> => {
    const entry = this.docs.get(ctx.id);
    if (!entry) return;
    try { entry.iframe.remove(); } catch { /* ignore */ }
    this.docs.delete(ctx.id);
  };

  hasDocument = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<boolean> => {
    return this.docs.has(ctx.id);
  };

  /** Called by ExtensionManager.kill to clean up on extension shutdown. */
  closeForExt(extId: string): void {
    const entry = this.docs.get(extId);
    if (!entry) return;
    try { entry.iframe.remove(); } catch { /* ignore */ }
    this.docs.delete(extId);
  }
}
