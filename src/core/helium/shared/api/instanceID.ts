import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeInstanceID {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onTokenRefresh: ChromeEvent = new ChromeEvent();

  /**
   * `chrome.instanceID.*` — Firebase instance IDs / token rotation.
   * Same constraint as chrome.gcm — needs GCM infrastructure.
   *
   * We synthesize a per-extension stable ID derived from `ctx.id`.
   * Tokens are returned as empty strings; extensions branching on
   * truthy token pick the "no push" path.
   */
  deleteID(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  deleteToken(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  getCreationTime(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(Date.now()); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(Date.now());
  }

  getID(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(this.ctx.id); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(this.ctx.id);
  }

  getToken(...args: any[]): any {
    // Empty token means "no push" — extensions retry or skip.
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(''); } catch { /* swallow */ } return undefined; }
    return Promise.resolve('');
  }

}
