// src/core/helium/host/webRequest/registry.ts
//
// Tracks live chrome.webRequest.* listeners as registered by every
// running extension. One instance per ExtensionManager, threaded
// into the WebRequestPlugin so taps can iterate subscribers cheaply.
//
// Subscriber lifecycle:
//   subscribe(extId, event, listener, filter, extraInfoSpec)
//     → returns a `disposer` fn
//
// `listener` here is the host-side internal callback. The BG iframe
// registers chrome.webRequest.onBeforeRequest.addListener; the
// bootstrap forwards subscription metadata to host via Event RPC
// (Task 27); host materializes an entry in this registry with a
// listener that calls back via channel.requestEvent.
//
// Each subscriber gets a stable monotonic `opaqueId`. The
// host→BG event RPC uses this id (rather than identifying the
// listener fn by ref) so disposers can match a specific entry even
// when several extensions register on the same event.

import type { RequestFilter } from './filter';

export type WebRequestEvent =
  | 'onBeforeRequest'
  | 'onBeforeSendHeaders'
  | 'onSendHeaders'
  | 'onHeadersReceived'
  | 'onAuthRequired'
  | 'onResponseStarted'
  | 'onBeforeRedirect'
  | 'onCompleted'
  | 'onErrorOccurred';

export type ExtraInfoSpec =
  | 'blocking'
  | 'requestHeaders'
  | 'responseHeaders'
  | 'extraHeaders'
  | 'asyncBlocking';

/**
 * Listener call signature: receives the constructed `details`
 * object plus context, returns whatever the extension's listener
 * returned (BlockingResponse or undefined). The dispatcher (events.ts)
 * is responsible for routing the call across the BG channel.
 */
export type WebRequestListener = (
  details: Record<string, unknown>,
) => Promise<unknown> | unknown;

export interface Subscriber {
  extId: string;
  event: WebRequestEvent;
  filter: RequestFilter;
  extraInfoSpec: ExtraInfoSpec[];
  listener: WebRequestListener;
  opaqueId: number;
  isBlocking: boolean;
}

export class WebRequestRegistry {
  private nextId = 1;
  // event → list of subscribers (insertion-ordered).
  private readonly byEvent: Map<WebRequestEvent, Subscriber[]> = new Map();
  // extId → set of opaqueIds (for fast clearForExt).
  private readonly byExt: Map<string, Set<number>> = new Map();

  subscribe(
    extId: string,
    event: WebRequestEvent,
    listener: WebRequestListener,
    filter: RequestFilter,
    extraInfoSpec: ExtraInfoSpec[] = [],
  ): { opaqueId: number; dispose: () => void } {
    const opaqueId = this.nextId++;
    const isBlocking =
      extraInfoSpec.includes('blocking') || extraInfoSpec.includes('asyncBlocking');
    const sub: Subscriber = {
      extId,
      event,
      filter,
      extraInfoSpec,
      listener,
      opaqueId,
      isBlocking,
    };

    let list = this.byEvent.get(event);
    if (!list) {
      list = [];
      this.byEvent.set(event, list);
    }
    list.push(sub);

    let extIds = this.byExt.get(extId);
    if (!extIds) {
      extIds = new Set();
      this.byExt.set(extId, extIds);
    }
    extIds.add(opaqueId);

    return {
      opaqueId,
      dispose: () => this.unsubscribe(opaqueId),
    };
  }

  unsubscribe(opaqueId: number): void {
    for (const [event, list] of this.byEvent) {
      const idx = list.findIndex((s) => s.opaqueId === opaqueId);
      if (idx >= 0) {
        const sub = list[idx]!;
        list.splice(idx, 1);
        this.byExt.get(sub.extId)?.delete(opaqueId);
        if (list.length === 0) this.byEvent.delete(event);
        return;
      }
    }
  }

  /** Remove every subscription from `extId`. Called on `kill(extId)`. */
  clearForExt(extId: string): void {
    const ids = this.byExt.get(extId);
    if (!ids) return;
    for (const id of ids) {
      for (const [event, list] of this.byEvent) {
        const idx = list.findIndex((s) => s.opaqueId === id);
        if (idx >= 0) {
          list.splice(idx, 1);
          if (list.length === 0) this.byEvent.delete(event);
          break;
        }
      }
    }
    this.byExt.delete(extId);
  }

  /** Iterate subscribers for an event (snapshot). Order is registration order. */
  forEvent(event: WebRequestEvent): readonly Subscriber[] {
    return this.byEvent.get(event) ?? [];
  }

  /** True if any subscriber on `event` has `['blocking']` in its extraInfoSpec. */
  hasBlocking(event: WebRequestEvent): boolean {
    const list = this.byEvent.get(event);
    if (!list) return false;
    for (const s of list) if (s.isBlocking) return true;
    return false;
  }

  /** Diagnostic only. */
  size(): number {
    let n = 0;
    for (const list of this.byEvent.values()) n += list.length;
    return n;
  }
}
