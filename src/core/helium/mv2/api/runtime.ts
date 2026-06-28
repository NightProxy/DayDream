import type { ExtensionContext } from '../../extfs/types';
import { ChromeRuntimeBase } from '../../shared';

export class ChromeRuntime extends ChromeRuntimeBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  // MV2-only methods. All three are safe no-ops at the stub level
  // because:
  //
  // - getBackgroundPage: callback receives a Window. We have no
  //   accessible reference (the BG iframe lives in another realm),
  //   but Chrome's behaviour on "no persistent BG" is to invoke the
  //   callback with `null` — which is exactly what we do. Extensions
  //   that depend on the page reference have a `null`-check fallback
  //   path; the few that don't shouldn't be calling this anyway.
  //
  // - getPackageDirectoryEntry: an obsolete File API; almost no
  //   popular extension touches it. Resolve with undefined so the
  //   rare caller doesn't crash.
  //
  // - getVersion: synthesize from the manifest. The version is
  //   already in `ctx.manifest.version`, so this is trivial.

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
