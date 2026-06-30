import type { ExtensionContext } from '../../extfs/types';

/**
 * `chrome.extension` stub. Same pre-handshake safety principle as
 * `ChromeRuntime`: throw only when there's no honest default; no-op
 * when the contract is "void" or "returns a boolean / array that
 * tolerates an empty answer."
 */
export class ChromeExtensionBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public inIncognitoContext: boolean = false;

  getURL(path: string): string {
    const rel = path.replace(/^\/+/, '');
    return `https://${this.ctx.origin}/${rel}`;
  }

  isAllowedFileSchemeAccess(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
  }

  isAllowedIncognitoAccess(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
  }

  setUpdateUrlData(..._args: any[]): undefined {
    return undefined;
  }

  static readonly ViewType = {
    POPUP: "popup",
    TAB: "tab",
  } as const;
}
