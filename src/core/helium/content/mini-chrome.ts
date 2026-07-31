/**
 * Helium mini-chrome runtime — IIFE bundle that runs in every proxied
 * page that has at least one Helium content script registered.
 *
 * Exposed globals:
 *   window.__helium_csChrome__  : (ctx, scriptKey) => ChromeMiniInstance
 *   window.__helium_isolation__ : { runIsolated(ctx, scriptKey, body) }
 *
 * Routes async chrome.* calls back to the host via window.top.postMessage,
 * registers per-script presence so the host knows which windows to
 * fanout events to, and constructs Port objects on demand.
 */

import { runIsolated } from './isolation';
import { ChromeMiniInstance, unregisterAll } from './mini-chrome-instance';

declare const __HELIUM_MINI_CHROME_INSTALLED__: unique symbol;
const gWin = window as unknown as { [k: symbol]: boolean };
const INSTALL_KEY = Symbol.for('helium.mini-chrome.installed');
if ((gWin as any)[INSTALL_KEY]) {
  // Already installed (e.g., via another extension's load order).
  // Re-running is a no-op.
} else {
  (gWin as any)[INSTALL_KEY] = true;

  (window as any).__helium_csChrome__ = (ctx: any, scriptKey: string) => {
    return new ChromeMiniInstance(ctx, scriptKey);
  };

  (window as any).__helium_isolation__ = {
    runIsolated,
  };

  window.addEventListener('pagehide', () => {
    unregisterAll();
  }, { once: true });
}
