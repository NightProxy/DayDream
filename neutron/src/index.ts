import { DEFAULT_BUFFER_SIZE, LENGTH_BUFFER_BYTES } from './constants';
import { encodeUtf8, serializeError } from './encode';
import {
  NeutronTerminatedError,
  type NeutronHandler,
  type NeutronHandlerContext,
  type NeutronInit,
  type NeutronOptions,
  type NeutronRequest,
} from './types';

export class Neutron {
  readonly pid: number;
  readonly exited: Promise<number>;

  private readonly worker: Worker;
  private readonly ownsWorker: boolean;
  private readonly lengthBuffer: SharedArrayBuffer;
  private readonly valueBuffer: SharedArrayBuffer;
  private readonly lengthTyped: Int32Array;
  private readonly valueTyped: Uint8Array;
  private readonly handlers: Map<string, NeutronHandler> = new Map();
  private readonly pendingRequests: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private readonly hostCtx: NeutronHandlerContext;

  private terminated = false;
  private exitCode = 0;
  private resolveExit: (code: number) => void = () => {};
  private nextRequestId = 0;
  private static nextPid = 1;

  constructor(options: NeutronOptions) {
    if (!self.crossOriginIsolated) {
      throw new Error(
        'Neutron requires cross-origin isolation. ' +
          'Serve with Cross-Origin-Opener-Policy: same-origin and ' +
          'Cross-Origin-Embedder-Policy: require-corp. ' +
          'See https://web.dev/coop-coep/ for details.',
      );
    }

    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error('Neutron requires SharedArrayBuffer (not available in this environment)');
    }

    this.pid = Neutron.nextPid++;

    const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
    this.lengthBuffer = new SharedArrayBuffer(LENGTH_BUFFER_BYTES);
    this.valueBuffer = new SharedArrayBuffer(bufferSize);
    this.lengthTyped = new Int32Array(this.lengthBuffer);
    this.valueTyped = new Uint8Array(this.valueBuffer);

    if (options.worker) {
      this.worker = options.worker;
      this.ownsWorker = false;
    } else if (options.workerUrl) {
      this.worker = new Worker(options.workerUrl, options.workerOptions ?? { type: 'module' });
      this.ownsWorker = true;
    } else {
      throw new Error('Neutron requires either `worker` or `workerUrl` in options');
    }

    this.exited = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });

    this.hostCtx = {
      push: (message: unknown) => this.push(message),
    };

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);

    const init: NeutronInit = {
      lengthBuffer: this.lengthBuffer,
      valueBuffer: this.valueBuffer,
      ...(options.bootstrap !== undefined ? { bootstrap: options.bootstrap } : {}),
    };
    this.worker.postMessage(init);
  }

  on(type: string, handler: NeutronHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Neutron handler for '${type}' is already registered`);
    }
    this.handlers.set(type, handler);
  }

  off(type: string): boolean {
    return this.handlers.delete(type);
  }

  push(message: unknown): void {
    if (this.terminated) {
      throw new NeutronTerminatedError('Cannot push to a terminated Neutron worker');
    }
    this.writeReply(message);
  }

  /**
   * Send an asynchronous, fire-and-forget message to the worker via the
   * regular postMessage channel (not the synchronous SAB reply channel
   * that `push()` uses).
   *
   * Use this for events the host needs to deliver to the worker that
   * don't expect a response — e.g. invoking a callback the worker
   * previously registered through a `{__callback__: id}` marker, where
   * the SAB channel must remain free for the worker's ongoing
   * synchronous sends.
   *
   * Worker code can observe these messages by adding its own
   * `self.addEventListener('message', ...)` listener; Neutron's
   * built-in init listener uses `{ once: true }`, so subsequent
   * messages are visible to consumer code.
   */
  postToWorker(message: unknown): void {
    if (this.terminated) {
      throw new NeutronTerminatedError('Cannot postToWorker on a terminated Neutron worker');
    }
    this.worker.postMessage(message);
  }

  request(message: NeutronRequest): Promise<unknown> {
    if (this.terminated) {
      return Promise.reject(new NeutronTerminatedError('Cannot send request to a terminated Neutron worker'));
    }
    return new Promise<unknown>((resolve, reject) => {
      const id = `__neutron_req_${this.nextRequestId++}__`;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, __neutron_request_id__: id });
    });
  }

  async terminate(code = 0): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    this.exitCode = code;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    if (this.ownsWorker) this.worker.terminate();
    for (const { reject } of this.pendingRequests.values()) {
      reject(new NeutronTerminatedError());
    }
    this.pendingRequests.clear();
    this.resolveExit(code);
  }

  private handleMessage = (e: MessageEvent): void => {
    if (this.terminated) return;
    const data = e.data;
    if (data === null || typeof data !== 'object') {
      return;
    }

    const rec = data as Record<string, unknown>;
    const isBlocking = rec.__neutron_blocking__ === true;

    const respondId = rec.__neutron_response_id__;
    if (typeof respondId === 'string') {
      const pending = this.pendingRequests.get(respondId);
      if (pending) {
        this.pendingRequests.delete(respondId);
        const value = rec.value;
        const error = rec.error;
        if (error !== undefined) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          pending.resolve(value);
        }
      }
      return;
    }

    const type = rec.type;
    if (typeof type !== 'string') {
      if (isBlocking) this.writeReply(undefined);
      return;
    }

    const handler = this.handlers.get(type);
    if (!handler) {
      if (isBlocking) {
        const err = new Error(`No handler registered for Neutron request type '${type}'`);
        (err as Error & { code?: string }).code = 'ENOHANDLER';
        this.writeReply(serializeError(err));
      }
      return;
    }

    void this.dispatch(handler, data as NeutronRequest, isBlocking);
  };

  private async dispatch(handler: NeutronHandler, request: NeutronRequest, isBlocking: boolean): Promise<void> {
    try {
      const result = await handler(request, this.hostCtx);
      if (this.terminated) return;
      if (isBlocking) this.writeReply(result);
    } catch (err) {
      if (this.terminated) return;
      if (isBlocking) this.writeReply(serializeError(err));
    }
  }

  private writeReply(value: unknown): void {
    const text = value === undefined ? '' : JSON.stringify(value);
    const bytes = encodeUtf8(text);
    if (bytes.length > this.valueTyped.length) {
      const overflow = serializeError(
        new Error(
          `Neutron response exceeds buffer (${bytes.length} > ${this.valueTyped.length}). ` +
            `Increase bufferSize or chunk the response.`,
        ),
      );
      const overflowText = JSON.stringify(overflow);
      const overflowBytes = encodeUtf8(overflowText);
      for (let i = 0; i < overflowBytes.length; i++) {
        const b = overflowBytes[i];
        if (b !== undefined) Atomics.store(this.valueTyped, i, b);
      }
      Atomics.store(this.lengthTyped, 0, overflowBytes.length);
      Atomics.notify(this.lengthTyped, 0);
      return;
    }
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b !== undefined) Atomics.store(this.valueTyped, i, b);
    }
    Atomics.store(this.lengthTyped, 0, bytes.length);
    Atomics.notify(this.lengthTyped, 0);
  }

  private handleError = (e: ErrorEvent): void => {
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error(e.message || 'Worker error'));
    }
    this.pendingRequests.clear();
    if (!this.terminated) {
      this.terminated = true;
      this.exitCode = 1;
      if (this.ownsWorker) this.worker.terminate();
      this.resolveExit(1);
    }
  };
}
