// src/core/helium/bootstrap/event-rpc.ts
//
// Event Subscription RPC — BG-side utilities.
//
// Used by bootstrap/client.ts to materialize chrome.<ns>.<event>.
//   addListener(fn, filter?, extraInfoSpec?)
//   removeListener(fn)
// across the host channel for event surfaces whose listeners can
// return a value (blocking events like webRequest.onBeforeRequest).
//
// Protocol summary:
//
//   BG → host (one-shot):
//     channel.request('__helium_event_subscribe__',
//       [eventMethod, opaqueId, filter, extraInfoSpec])
//     channel.request('__helium_event_unsubscribe__',
//       [eventMethod, opaqueId])
//
//   Host → BG (per fire, may await):
//     channel.requestEvent(eventMethod, [opaqueId, ...listenerArgs])
//
//   BG registers a local event-handler keyed on the event method
//   that dispatches to the listener registered for the inbound
//   opaqueId. Listener return value is the event-resp.
//
// Observer (non-blocking) events bypass the requestEvent round-trip
// by going through `sendEvent(eventMethod, [opaqueId, ...args])`
// which is fire-and-forget.

import type { ExtensionBridgeChannel } from './channel';

interface ListenerEntry {
  // The listener registered via addListener(fn, ...).
  fn: (...args: unknown[]) => unknown;
  // Sticky id assigned by BG and shared with host so removeListener
  // can identify exactly which entry to drop.
  opaqueId: number;
}

const listeners = new Map<string, Map<number, ListenerEntry>>(); // method → opaqueId → entry
let nextOpaqueId = 1;

/**
 * Register a chrome.<ns>.<event>.addListener-style listener and tell
 * the host. Returns the opaqueId — caller stores it and passes it
 * back to unsubscribeEvent on removeListener.
 */
export function subscribeEvent(
  method: string,
  channel: ExtensionBridgeChannel,
  fn: (...args: unknown[]) => unknown,
  filter?: unknown,
  extraInfoSpec?: unknown,
): number {
  const opaqueId = nextOpaqueId++;
  let perMethod = listeners.get(method);
  if (!perMethod) {
    perMethod = new Map();
    listeners.set(method, perMethod);
    // First subscription for this method → install the inbound
    // event-handler. Subsequent subs reuse it.
    installInboundHandler(method, channel);
  }
  perMethod.set(opaqueId, { fn, opaqueId });

  // Notify host (fire-and-forget; if it fails, the listener simply
  // won't get called, which surfaces as the extension not seeing
  // events. Acceptable for v1.)
  void channel
    .request('__helium_event_subscribe__', {
      args: [method, opaqueId, filter, extraInfoSpec],
    })
    .catch((err: unknown) => {
      console.warn(
        `[helium/event-rpc] subscribe failed for ${method}:`,
        err,
      );
    });

  return opaqueId;
}

export function unsubscribeEvent(
  method: string,
  channel: ExtensionBridgeChannel,
  opaqueId: number,
): void {
  const perMethod = listeners.get(method);
  if (!perMethod) return;
  perMethod.delete(opaqueId);
  if (perMethod.size === 0) {
    listeners.delete(method);
    channel.unregisterEventHandler(method);
  }
  void channel
    .request('__helium_event_unsubscribe__', {
      args: [method, opaqueId],
    })
    .catch((err: unknown) => {
      console.warn(
        `[helium/event-rpc] unsubscribe failed for ${method}:`,
        err,
      );
    });
}

/**
 * Used by client.ts to look up a registered fn by opaqueId — needed
 * when removeListener(fn) needs to find the opaqueId from the fn
 * reference. We do a linear scan; the listener count per event is
 * small.
 */
export function findOpaqueId(
  method: string,
  fn: (...args: unknown[]) => unknown,
): number | null {
  const perMethod = listeners.get(method);
  if (!perMethod) return null;
  for (const entry of perMethod.values()) {
    if (entry.fn === fn) return entry.opaqueId;
  }
  return null;
}

function installInboundHandler(
  method: string,
  channel: ExtensionBridgeChannel,
): void {
  // Inbound requestEvent: host fired the event; dispatch to all
  // listeners that match (opaqueId is the first arg, rest are
  // listener args). Return the first non-undefined result, per
  // Chrome's BlockingResponse semantics.
  channel.registerEventHandler(method, async (args) => {
    const opaqueId = args[0] as number | undefined;
    const listenerArgs = args.slice(1);
    const perMethod = listeners.get(method);
    if (!perMethod) return undefined;

    if (typeof opaqueId === 'number') {
      const entry = perMethod.get(opaqueId);
      if (!entry) return undefined;
      try {
        const r = entry.fn(...listenerArgs);
        if (r && typeof (r as { then?: unknown }).then === 'function') {
          return await (r as Promise<unknown>);
        }
        return r;
      } catch (err) {
        console.warn(`[helium/event-rpc] listener ${method} threw:`, err);
        return undefined;
      }
    }

    // No opaqueId targeted — broadcast to all and return first
    // non-undefined.
    let winner: unknown = undefined;
    for (const entry of perMethod.values()) {
      try {
        const r = entry.fn(...listenerArgs);
        const v =
          r && typeof (r as { then?: unknown }).then === 'function'
            ? await (r as Promise<unknown>)
            : r;
        if (v !== undefined && winner === undefined) winner = v;
      } catch (err) {
        console.warn(`[helium/event-rpc] listener ${method} threw:`, err);
      }
    }
    return winner;
  });

  // Also handle fire-and-forget events (sendEvent path) for the
  // observer case. The existing `setEventHandler` global dispatcher
  // already covers chrome.<ns>.<event>.dispatch routing in client.ts,
  // so we don't duplicate that here.
}

/**
 * Diagnostic: total live listener count across all events.
 */
export function listenerCount(): number {
  let n = 0;
  for (const m of listeners.values()) n += m.size;
  return n;
}

/**
 * For tests / sanity. Clears all listener bookkeeping. Does NOT
 * notify host.
 */
export function _resetForTests(): void {
  listeners.clear();
  nextOpaqueId = 1;
}
