/**
 * Pseudo-isolation: wraps the script body in an IIFE that captures
 * host intrinsics into local variables before running. NOT real
 * isolation — pages can still see/mutate globals the script
 * accidentally assigns to `window`. Last-resort fallback when
 * ShadowRealm + Neutron are both unavailable.
 */

import { ChromeMiniInstance } from '../mini-chrome-instance';

export function runPseudo(ctx: any, scriptKey: string, scriptBody: string): void {
  const chromeInstance = new ChromeMiniInstance(ctx, scriptKey);
  Object.freeze(chromeInstance.runtime);
  Object.freeze(chromeInstance.extension);
  Object.freeze(chromeInstance.storage);
  Object.freeze(chromeInstance.tabs);

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
