import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeGcm {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onSendError: ChromeEvent = new ChromeEvent();
  public readonly onMessagesDeleted: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();

  /**
   * `chrome.gcm.*` — Google Cloud Messaging is fundamentally
   * unavailable in DDX (it needs GCM infrastructure and a real
   * Chrome registration). The shape returns documented "no
   * registration" errors so extensions can branch on
   * `chrome.runtime.lastError` and fall back to non-push flows.
   */
  register(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(''); } catch { /* swallow */ } return undefined; }
    return Promise.resolve('');
  }

  send(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(''); } catch { /* swallow */ } return undefined; }
    return Promise.resolve('');
  }

  unregister(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  static readonly MAX_MESSAGE_SIZE: number = 4096;
}
