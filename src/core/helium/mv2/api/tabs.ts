import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent, ChromeTabsBase } from '../../shared';

/**
 * MV2 chrome.tabs extras. `executeScript` / `insertCSS` / `removeCSS`
 * are RPC-wired (host adapts MV2 args to chrome.scripting.* on the
 * back-end) — see `apis/extensions.ts:handlerImpls`. The stub here
 * resolves with a sensible default; the bootstrap overlay replaces
 * it with the real RPC-aware version post-handshake.
 *
 * `getAllInWindow` / `getSelected` / `sendRequest` are deprecated MV2
 * methods. We no-op them rather than throw — extensions that still
 * call them will see no-op results (matching Chrome's "deprecated;
 * use the modern equivalent" behavior).
 */
export class ChromeTabs extends ChromeTabsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly onHighlightChanged: ChromeEvent = new ChromeEvent();
  public readonly onActiveChanged: ChromeEvent = new ChromeEvent();
  public readonly onSelectionChanged: ChromeEvent = new ChromeEvent();

  // Pre-handshake stub. Resolves with [] (the same return shape as
  // chrome.scripting.executeScript: an array of frame-result entries).
  // Post-handshake, the bootstrap overlay replaces this with an
  // RPC trampoline that hits the MV2-adapter on the host.
  executeScript(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }
  insertCSS(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }
  removeCSS(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  // Deprecated MV2. Return safe-empty defaults.
  getAllInWindow(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }
  getSelected(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
  sendRequest(...args: any[]): any {
    // Deprecated alias of chrome.tabs.sendMessage. Resolve undefined;
    // extensions that need a real round-trip should migrate.
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
}
