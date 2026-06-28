/**
 * Bidirectional RPC over a MessagePort. Symmetric — both the host
 * and the extension iframe construct one of these around their end
 * of a MessageChannel and use it identically.
 *
 * Operations:
 *   - registerHandler(method, fn)     — handle inbound requests
 *   - setEventHandler(fn)             — handle inbound fire-and-forget events
 *   - request(method, payload, opts)  — call peer, await reply
 *   - sendEvent(method, args)         — fire-and-forget to peer
 *   - requestEvent(method, args)      — call peer's event-handler, await reply
 *                                       (used for blocking events, e.g.
 *                                       webRequest.onBeforeRequest with
 *                                       extraInfoSpec ['blocking']; symmetric
 *                                       to `request` but routed to the peer's
 *                                       event handler map rather than the
 *                                       general request handler map)
 *   - registerEventHandler(method, fn) — handle inbound `requestEvent` calls
 *   - close()                         — port.close() + drop pending requests
 *
 * Wire format (all messages are JSON-serializable):
 *   request:    { kind: 'request',    id, method, args }
 *   response:   { kind: 'response',   id, result }
 *   error:      { kind: 'response',   id, error: { message, name } }
 *   event:      { kind: 'event',      method, args }
 *   event-req:  { kind: 'event-req',  id, method, args }
 *   event-resp: { kind: 'event-resp', id, result }
 *   event-err:  { kind: 'event-resp', id, error: { message, name } }
 *
 * Request IDs are monotonic local to each ExtensionBridgeChannel
 * instance. They share a single counter across `request` and
 * `requestEvent` so an id never collides with itself on the wire.
 * Pending requests are dropped (rejected) on close().
 */
export class ExtensionBridgeChannel {
  private port: MessagePort;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private pendingEvents = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private handlers = new Map<
    string,
    (req: { args: unknown[] }) => Promise<unknown>
  >();
  private eventHandlers = new Map<
    string,
    (args: unknown[]) => Promise<unknown> | unknown
  >();
  private eventHandler: ((method: string, args: unknown[]) => void) | null = null;
  private closed = false;

  constructor(port: MessagePort) {
    this.port = port;
    this.port.onmessage = (e) => {
      void this.onMessage(e);
    };
    this.port.start();
  }

  registerHandler(
    method: string,
    handler: (req: { args: unknown[] }) => Promise<unknown>,
  ): void {
    this.handlers.set(method, handler);
  }

  setEventHandler(
    handler: (method: string, args: unknown[]) => void,
  ): void {
    this.eventHandler = handler;
  }

  request(
    method: string,
    payload: { args: unknown[] },
    opts: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('ExtensionBridgeChannel is closed'));
    }
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({
        kind: 'request',
        id,
        method,
        args: payload.args,
      });
      if (opts.timeoutMs) {
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(
              new Error(`ExtensionBridgeChannel timeout for ${method}`),
            );
          }
        }, opts.timeoutMs);
      }
    });
  }

  sendEvent(method: string, args: unknown[]): void {
    if (this.closed) return;
    this.port.postMessage({ kind: 'event', method, args });
  }

  /**
   * Symmetric to `request()` but routes to the peer's
   * `registerEventHandler` map. Used for blocking events whose
   * listeners need to return a value to the caller (e.g.
   * webRequest.onBeforeRequest's BlockingResponse).
   */
  requestEvent(
    method: string,
    args: unknown[],
    opts: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('ExtensionBridgeChannel is closed'));
    }
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pendingEvents.set(id, { resolve, reject });
      this.port.postMessage({
        kind: 'event-req',
        id,
        method,
        args,
      });
      if (opts.timeoutMs) {
        setTimeout(() => {
          if (this.pendingEvents.has(id)) {
            this.pendingEvents.delete(id);
            reject(
              new Error(
                `ExtensionBridgeChannel event timeout for ${method}`,
              ),
            );
          }
        }, opts.timeoutMs);
      }
    });
  }

  /**
   * Register an inbound handler for `requestEvent` calls. The
   * handler receives the args array and returns a result (or
   * Promise) that gets sent back as the event-resp.
   */
  registerEventHandler(
    method: string,
    handler: (args: unknown[]) => Promise<unknown> | unknown,
  ): void {
    this.eventHandlers.set(method, handler);
  }

  unregisterEventHandler(method: string): void {
    this.eventHandlers.delete(method);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const { reject } of this.pending.values()) {
      reject(new Error('ExtensionBridgeChannel closed'));
    }
    this.pending.clear();
    for (const { reject } of this.pendingEvents.values()) {
      reject(new Error('ExtensionBridgeChannel closed'));
    }
    this.pendingEvents.clear();
    try {
      this.port.close();
    } catch {
      /* ignore */
    }
  }

  private async onMessage(e: MessageEvent): Promise<void> {
    const data = e.data as
      | { kind: string; id?: number; method?: string; args?: unknown[]; result?: unknown; error?: { message: string; name?: string } }
      | null
      | undefined;
    if (!data || typeof data !== 'object') return;

    if (data.kind === 'response' && typeof data.id === 'number') {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.error) {
        const err = new Error(data.error.message);
        err.name = data.error.name ?? 'Error';
        p.reject(err);
      } else {
        p.resolve(data.result);
      }
      return;
    }

    if (data.kind === 'request' && typeof data.id === 'number' && typeof data.method === 'string') {
      const handler = this.handlers.get(data.method);
      if (!handler) {
        this.port.postMessage({
          kind: 'response',
          id: data.id,
          error: {
            message: `No handler for ${data.method}`,
            name: 'Error',
          },
        });
        return;
      }
      try {
        const result = await handler({ args: data.args ?? [] });
        this.port.postMessage({ kind: 'response', id: data.id, result });
      } catch (err) {
        const e = err as Error;
        this.port.postMessage({
          kind: 'response',
          id: data.id,
          error: { message: e.message, name: e.name },
        });
      }
      return;
    }

    if (data.kind === 'event' && typeof data.method === 'string') {
      this.eventHandler?.(data.method, data.args ?? []);
      return;
    }

    if (
      data.kind === 'event-req' &&
      typeof data.id === 'number' &&
      typeof data.method === 'string'
    ) {
      const handler = this.eventHandlers.get(data.method);
      if (!handler) {
        this.port.postMessage({
          kind: 'event-resp',
          id: data.id,
          error: {
            message: `No event handler for ${data.method}`,
            name: 'Error',
          },
        });
        return;
      }
      try {
        const result = await handler(data.args ?? []);
        this.port.postMessage({ kind: 'event-resp', id: data.id, result });
      } catch (err) {
        const e = err as Error;
        this.port.postMessage({
          kind: 'event-resp',
          id: data.id,
          error: { message: e.message, name: e.name },
        });
      }
      return;
    }

    if (data.kind === 'event-resp' && typeof data.id === 'number') {
      const p = this.pendingEvents.get(data.id);
      if (!p) return;
      this.pendingEvents.delete(data.id);
      if (data.error) {
        const err = new Error(data.error.message);
        err.name = data.error.name ?? 'Error';
        p.reject(err);
      } else {
        p.resolve(data.result);
      }
      return;
    }
  }
}
