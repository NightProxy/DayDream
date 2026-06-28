// src/core/helium/host/cookies/events.ts
//
// NOTE(helium-t1-3): documented v1 limitation. chrome.cookies.onChanged
// is a no-op in v1.
//
// Why: Scramjet's controller propagates cookie updates across tabs
// via a BroadcastChannel named `__scramjet_controller_channel`
// (src/core/SJ/controller/src/index.ts:100). That channel only
// carries `{ updatedAt: number }` — a "store dirty" signal, not the
// actual changed cookie / value / cause triple that
// chrome.cookies.onChanged listeners expect (`{ removed, cookie,
// cause }`).
//
// Faithfully synthesizing per-cookie change events would require
// diffing the persisted cookie store on every dirty signal:
//   1. Snapshot CookieJar state on init.
//   2. On each dirty notification, dump the new state, diff against
//      the snapshot, emit one onChanged per delta, then re-snapshot.
//   3. Tag `cause` heuristically (explicit/expired/evicted/overwrite)
//      based on cookie attributes — Chrome's semantics aren't fully
//      recoverable without the originating call site.
//
// That's straightforward but I/O-heavy (a full dump on every cookie
// write across tabs). Most extensions that listen on onChanged use
// it for cache-invalidation in response to user sign-in/out; those
// callers will not see updates in v1 and must fall back to polling
// chrome.cookies.get / getAll. The installer below is a no-op
// placeholder so callers always receive a teardown function and the
// wiring code stays uniform.

import type { ExtensionManager } from '@apis/extensions';

export function installCookieEventListeners(_extMgr: ExtensionManager): () => void {
  // No-op for v1. See file header for rationale.
  return () => undefined;
}
