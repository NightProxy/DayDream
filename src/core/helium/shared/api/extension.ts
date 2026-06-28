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

  // Chrome contract: `Promise<boolean>` (or callback with boolean).
  // Returning `false` is the safe default — we don't have file scheme
  // access, and any extension that branches on this will pick the
  // "no file access" code path, which is a strictly safer default
  // than the "yes file access" branch (which would attempt actual
  // file:// URLs).
  isAllowedFileSchemeAccess(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
  }

  // Chrome contract: `Promise<boolean>` (or callback with boolean).
  // Same pattern as file-scheme above. Privacy Badger, uBlock, and
  // many other privacy / blocker extensions branch on this at BG
  // startup. Returning `false` (= "incognito not allowed") is the
  // safest default and matches what users would see if they hadn't
  // explicitly enabled the toggle.
  isAllowedIncognitoAccess(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
  }

  // Chrome contract: `void`. Telemetry-only — Chrome would
  // forward the data to the extension's update URL for analytics
  // purposes. We don't have an update URL pipeline, so dropping the
  // call is harmless.
  setUpdateUrlData(..._args: any[]): undefined {
    return undefined;
  }

  static readonly ViewType = {
    POPUP: "popup",
    TAB: "tab",
  } as const;
}
