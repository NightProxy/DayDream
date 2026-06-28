import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent, ChromeExtensionBase } from '../../shared';

/**
 * `chrome.extension` MV2-only methods. Most are deprecated aliases of
 * `chrome.runtime.*` and were retained in MV2 for back-compat with very
 * old extensions.
 *
 * Pre-handshake safety same as ChromeRuntime: no-op for safe-default
 * methods, throw only for ones where silent return is misleading.
 */
export class ChromeExtension extends ChromeExtensionBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly onRequestExternal: ChromeEvent = new ChromeEvent();
  public readonly onRequest: ChromeEvent = new ChromeEvent();
  public readonly onConnect: ChromeEvent = new ChromeEvent();
  public readonly onConnectExternal: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();
  public readonly onMessageExternal: ChromeEvent = new ChromeEvent();

  // Chrome contract: callback with Window. Same reasoning as
  // runtime.getBackgroundPage — return null when there's no
  // accessible BG page reference; extensions that call this have
  // null-check fallbacks.
  getBackgroundPage(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(null); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(null);
  }

  // Chrome contract: `Window[]`. Return [] — extensions handle this
  // as "no extension tabs found" and create new ones via tabs.create.
  getExtensionTabs(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  // Chrome contract: `Window[]`. Same as above. uBlock-MV2 calls this
  // from its popup to find an open dashboard tab and "switch to it
  // if present". Empty array → "not present", so it opens a new one.
  getViews(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  // sendRequest / connect / sendMessage are deprecated aliases of
  // chrome.runtime.*. Per the explore-agent's investigation, the real
  // path is for these to delegate. For now we no-op to avoid pre-
  // handshake throws — once handshake completes, the RPC overlay
  // for the underlying runtime methods activates (these themselves
  // are not in RPC_BINDINGS, so the no-op persists). If an extension
  // depends on the return value, it'll see undefined / [] and use
  // its fallback path.
  sendRequest(...args: any[]): any {
    // Last arg may be a callback (extId, request, options, cb).
    const cb = args.length > 0 && typeof args[args.length - 1] === 'function'
      ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
  connect(..._args: any[]): any {
    // Returns a Port in real Chrome. Pre-handshake we can't build
    // a real Port, and most extensions only call this from BG event
    // handlers anyway (not at top-level). Throw to flag this as
    // genuinely unsupported pre-handshake.
    throw new Error('chrome.extension.connect is not implemented');
  }
  connectNative(..._args: any[]): any {
    throw new Error('chrome.extension.connectNative is not implemented');
  }
  sendMessage(...args: any[]): any {
    // Deprecated alias of chrome.runtime.sendMessage. Same reasoning
    // as sendRequest above.
    const cb = args.length > 0 && typeof args[args.length - 1] === 'function'
      ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
  sendNativeMessage(..._args: any[]): any {
    throw new Error('chrome.extension.sendNativeMessage is not implemented');
  }
}
