import type { ExtensionContext } from '../../extfs/types';

/**
 * `chrome.power` — request the host keep the display / system awake.
 *
 * Wraps the modern Screen Wake Lock API (`navigator.wakeLock`). The
 * lock is held per `ChromePower` instance (== per extension iframe).
 *
 * Limitations:
 *   - Wake Lock can only hold a `screen` lock (the display); there's
 *     no equivalent of `Level.SYSTEM` in the web platform.
 *   - The browser may revoke the lock on its own (e.g. tab hidden).
 *     We don't try to re-acquire; the next `requestKeepAwake` call
 *     will retry.
 */
export class ChromePower {
  protected readonly ctx: ExtensionContext;
  private lock: { release(): Promise<void> } | null = null;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  async requestKeepAwake(...args: any[]): Promise<void> {
    // First arg is 'display' | 'system'. We treat both as screen lock.
    const _level = typeof args[0] === 'string' ? args[0] : 'display';
    void _level;
    try {
      if (this.lock) return; // already held
      const wl = (navigator as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (!wl) {
        console.warn('[helium/power] Wake Lock API unavailable');
        return;
      }
      this.lock = await wl.request('screen');
    } catch (err) {
      console.warn('[helium/power] requestKeepAwake failed:', err);
    }
  }

  async releaseKeepAwake(..._args: any[]): Promise<void> {
    if (!this.lock) return;
    try { await this.lock.release(); } catch { /* swallow */ }
    this.lock = null;
  }

  static readonly Level = {
    DISPLAY: "display",
    SYSTEM: "system",
  } as const;
}
