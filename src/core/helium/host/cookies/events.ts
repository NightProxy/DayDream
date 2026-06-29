// src/core/helium/host/cookies/events.ts
//
// chrome.cookies.onChanged event dispatcher.
//
// Two emission paths:
//
//  1. Same-tab mutations — `CookieAccessor.setCookie` /
//     `removeCookie` self-emit synchronously via the in-memory
//     listener set. Cause is known precisely (`explicit` for sets,
//     `overwrite` paired with explicit for value changes).
//
//  2. Cross-tab / SW mutations — Scramjet's controller broadcasts
//     `{updatedAt}` on `__scramjet_controller_channel` whenever the
//     persisted cookie store is dirtied by another context. We
//     subscribe, dump the current jar, diff against our last
//     snapshot, and emit one onChanged per delta. Cause is
//     synthesized:
//       - removed + expired (expirationDate <= now) → `expired`
//       - removed otherwise                          → `explicit`
//       - added with no prior at same identity       → `explicit`
//       - value/attribute change at same identity    → `overwrite` pair
//         (removed:prior cause:overwrite, then added:next cause:explicit)
//
// We fanout via `extMgr.fanoutEvent('chrome.cookies.onChanged',
// [{removed, cookie, cause}], 'cookies')` — only extensions with the
// `cookies` permission receive the event.

import type { ExtensionManager } from '@apis/extensions';
import type { CookieAccessor, CookieChangeDelta, DDXCookie } from '@apis/data/cookies';

const BROADCAST_CHANNEL_NAME = '__scramjet_controller_channel';

export function installCookieEventListeners(extMgr: ExtensionManager): () => void {
  // Defensive: cookie accessor lives on nyxCtx; only enable the
  // listeners if it's present (some tests / restricted modes may
  // omit it).
  const accessor: CookieAccessor | undefined = (extMgr as unknown as {
    nyxCtx?: { cookies?: CookieAccessor };
  }).nyxCtx?.cookies;
  if (!accessor) {
    return () => undefined;
  }

  const fanout = (delta: CookieChangeDelta): void => {
    try {
      extMgr.fanoutEvent('chrome.cookies.onChanged', [delta], 'cookies');
    } catch (err) {
      console.warn('[helium/cookies] fanout failed:', err);
    }
  };

  // Path 1: same-tab mutation listener — synchronous.
  const unsubLocal = accessor.onChange(fanout);

  // Path 2: cross-tab diff-on-dirty.
  let snapshot: Map<string, DDXCookie> = new Map();
  void accessor.snapshot().then((s) => { snapshot = s; });

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch (err) {
    console.warn('[helium/cookies] BroadcastChannel unavailable:', err);
    return () => { unsubLocal(); };
  }

  // Debounce dirty bursts (the controller can fire many in flight
  // during navigation). 30ms is enough to coalesce typical bursts.
  let pendingTimer: number | null = null;
  const scheduleDiff = (): void => {
    if (pendingTimer !== null) return;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      void runDiff();
    }, 30);
  };

  const runDiff = async (): Promise<void> => {
    let next: Map<string, DDXCookie>;
    try {
      next = await accessor.snapshot();
    } catch (err) {
      console.warn('[helium/cookies] snapshot failed:', err);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    // Find removals + value-overwrites (compare prior keys).
    for (const [key, prior] of snapshot) {
      const newer = next.get(key);
      if (!newer) {
        // Cookie disappeared.
        const expired = prior.expirationDate !== undefined && prior.expirationDate <= now;
        fanout({
          removed: true,
          cookie: prior,
          cause: expired ? 'expired' : 'explicit',
        });
        continue;
      }
      // Same key present — check if value/attrs changed.
      if (cookieDiffers(prior, newer)) {
        fanout({ removed: true, cookie: prior, cause: 'overwrite' });
        fanout({ removed: false, cookie: newer, cause: 'explicit' });
      }
    }
    // Find new additions (key not in prior snapshot).
    for (const [key, newer] of next) {
      if (!snapshot.has(key)) {
        fanout({ removed: false, cookie: newer, cause: 'explicit' });
      }
    }
    snapshot = next;
  };

  const onBcMessage = (e: MessageEvent): void => {
    const data = e.data as { updatedAt?: number } | null;
    if (!data) return;
    scheduleDiff();
  };
  bc.addEventListener('message', onBcMessage);

  return () => {
    unsubLocal();
    bc?.removeEventListener('message', onBcMessage);
    try { bc?.close(); } catch { /* noop */ }
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };
}

/**
 * Shallow value-equality check for two cookie snapshots at the same
 * identity (`domain|path|name`). Returns true if any user-visible
 * attribute differs (so the diff path emits an overwrite pair).
 */
function cookieDiffers(a: DDXCookie, b: DDXCookie): boolean {
  return (
    a.value !== b.value ||
    a.secure !== b.secure ||
    a.httpOnly !== b.httpOnly ||
    a.sameSite !== b.sameSite ||
    a.hostOnly !== b.hostOnly ||
    a.session !== b.session ||
    a.expirationDate !== b.expirationDate
  );
}
