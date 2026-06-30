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

  getBackgroundPage(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(null); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(null);
  }

  getExtensionTabs(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  getViews(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  sendRequest(...args: any[]): any {
    const cb = args.length > 0 && typeof args[args.length - 1] === 'function'
      ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
  connect(..._args: any[]): any {
    throw new Error('chrome.extension.connect is not implemented');
  }
  connectNative(..._args: any[]): any {
    throw new Error('chrome.extension.connectNative is not implemented');
  }
  sendMessage(...args: any[]): any {
    const cb = args.length > 0 && typeof args[args.length - 1] === 'function'
      ? args[args.length - 1] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }
  sendNativeMessage(..._args: any[]): any {
    throw new Error('chrome.extension.sendNativeMessage is not implemented');
  }
}
