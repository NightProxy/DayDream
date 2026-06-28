/**
 * Pseudo-isolation: wraps the script body in an IIFE that captures
 * host intrinsics into local variables before running. NOT real
 * isolation — pages can still see/mutate globals the script
 * accidentally assigns to `window`. Last-resort fallback when
 * ShadowRealm + Neutron are both unavailable.
 */

import { ChromeMiniInstance } from '../mini-chrome-instance';

export function runPseudo(ctx: any, scriptKey: string, scriptBody: string): void {
  // Pseudo runs in the page realm; let the constructor post window-ready
  // so the host can route events back to this same window.
  const chromeInstance = new ChromeMiniInstance(ctx, scriptKey);
  // Freeze the surface so a misbehaving script can't replace methods.
  // Doesn't prevent mutation of unfrozen nested objects (e.g.
  // chrome.runtime.lastError) since we need to mutate that ourselves.
  Object.freeze(chromeInstance.runtime);
  Object.freeze(chromeInstance.extension);
  Object.freeze(chromeInstance.storage);
  Object.freeze(chromeInstance.tabs);

  // Capture intrinsics before any user code runs. If the page later
  // monkey-patches `Object`, the script body sees the captured ref.
  const _Object = Object;
  const _Array = Array;
  const _Promise = Promise;
  const _JSON = JSON;

  try {
    const fn = new Function(
      'chrome', '_Object', '_Array', '_Promise', '_JSON',
      `"use strict";\n${scriptBody}\n`,
    );
    fn(chromeInstance, _Object, _Array, _Promise, _JSON);
  } catch (err) {
    console.error('[helium/content] pseudo-iso script error:', err);
  }
}
