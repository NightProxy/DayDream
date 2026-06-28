/**
 * Isolation mode detection and dispatch.
 *
 * Detected once at module load. ShadowRealm is preferred (where
 * available — Chrome 125+ behind a flag); falls back to
 * neutron-proxy in any cross-origin-isolated context with SAB; falls
 * back to pseudo (frozen-globals IIFE) elsewhere.
 *
 * DDX is always COI'd (Scramjet requires it), so neutron-proxy is
 * always available on DDX. Pseudo is for non-DDX hosts of Helium.
 */

import { runPseudo } from './pseudo';
import { runShadowRealm } from './shadowrealm';
import { runNeutron } from './neutron-worker';

export type IsoMode = 'shadowrealm' | 'neutron-proxy' | 'pseudo';

export const ISO_MODE: IsoMode = (() => {
  try {
    if (typeof (globalThis as any).ShadowRealm === 'function') return 'shadowrealm';
  } catch { /* ignore */ }
  try {
    if (typeof SharedArrayBuffer !== 'undefined' && (self as any).crossOriginIsolated === true) {
      return 'neutron-proxy';
    }
  } catch { /* ignore */ }
  console.warn('[helium/content] no ShadowRealm or COI+SAB available; falling back to pseudo-iso. Pages can see/mutate script-created globals.');
  return 'pseudo';
})();

export function runIsolated(ctx: any, scriptKey: string, scriptBody: string): void {
  if (ISO_MODE === 'shadowrealm') return runShadowRealm(ctx, scriptKey, scriptBody);
  if (ISO_MODE === 'neutron-proxy') return runNeutron(ctx, scriptKey, scriptBody);
  return runPseudo(ctx, scriptKey, scriptBody);
}
