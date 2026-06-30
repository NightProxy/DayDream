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
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
}
