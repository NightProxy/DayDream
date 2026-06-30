
import type { ExtensionBridgeChannel } from './channel';

interface ListenerEntry {
  fn: (...args: unknown[]) => unknown;
  opaqueId: number;
}

const listeners = new Map<string, Map<number, ListenerEntry>>();
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
    installInboundHandler(method, channel);
  }
  perMethod.set(opaqueId, { fn, opaqueId });

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
