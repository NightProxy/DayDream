import type { ExtensionContext } from '../../extfs/types';
import { ChromeRuntimeBase } from '../../shared';

export class ChromeRuntime extends ChromeRuntimeBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  getBackgroundPage(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(null); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(null);
  }

  getPackageDirectoryEntry(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }

  getVersion(): string {
    return (this.ctx.manifest as { version?: string }).version ?? '0.0.0';
  }

  static readonly ExtensionViewerState = {
    DISABLED: "disabled",
    ENABLED: "enabled",
  } as const;

  static readonly UserSubscriptionState = {
    SIGNINSTATE_FREE: "signinstate_free",
    SIGNINSTATE_PENDING: "signinstate_pending",
    SIGNINSTATE_SUBSCRIBED: "signinstate_subscribed",
  } as const;
}
