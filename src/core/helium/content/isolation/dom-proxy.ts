/**
 * Unified DOM-Proxy: wraps a host-side DOM Element handle (returned
 * by Neutron RPC or ShadowRealm's bridging functions) so the
 * isolated content script can interact with it via normal property
 * access syntax. Each property/method invocation makes a synchronous
 * round-trip through `callSync`.
 *
 * The trade-off: any non-trivial DOM operation becomes O(N) RPC
 * calls. Heavy DOM manipulation in ISOLATED-world content scripts
 * is functional but slow.
 */

export interface DomHandle { __handle: string }

export function isHandle(v: unknown): v is DomHandle {
  return !!v && typeof v === 'object' && '__handle' in (v as object);
}

// Wire marker used by the host to signal "this property is a function — call
// it via `method-call`". Must be a plain string key because the marker
// crosses the Neutron SAB boundary via JSON.stringify, which silently drops
// symbol-keyed properties. The host side (see neutron-worker.ts and the
// shadowrealm/pseudo bridge) emits `{ __method__: true, name }`.
const METHOD_MARKER_KEY = '__method__';

interface MethodMarker {
  [METHOD_MARKER_KEY]: true;
  name: string;
}

function isMethodMarker(v: unknown): v is MethodMarker {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>)[METHOD_MARKER_KEY] === true;
}

// Wire marker for "this argument is a callback function registered in the
// worker under this opaque id". When the host applies a method whose args
// contain this marker, it substitutes a real function that, when invoked,
// posts `{ type: 'helium.cb', id, args }` back to the worker so the
// worker can dispatch into its callback registry. Same plain-key constraint
// as METHOD_MARKER_KEY: must survive JSON.stringify across the Neutron SAB.
export const CALLBACK_MARKER_KEY = '__callback__';

export interface CallbackMarker {
  [CALLBACK_MARKER_KEY]: number;
}

export function isCallbackMarker(v: unknown): v is CallbackMarker {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>)[CALLBACK_MARKER_KEY] === 'number'
  );
}

// Wire envelope the host uses to invoke a worker-resident callback. Travels
// host→worker via the regular postMessage channel (Neutron.postToWorker),
// NOT via the synchronous SAB reply channel.
export const CALLBACK_INVOKE_TYPE = 'helium.cb';

export interface CallbackInvocation {
  type: typeof CALLBACK_INVOKE_TYPE;
  id: number;
  args: unknown[];
}

export function isCallbackInvocation(v: unknown): v is CallbackInvocation {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as Record<string, unknown>).type === CALLBACK_INVOKE_TYPE &&
    typeof (v as Record<string, unknown>).id === 'number' &&
    Array.isArray((v as Record<string, unknown>).args)
  );
}

export type CallSync = (op: 'property-get' | 'property-set' | 'property-has' | 'method-call', args: unknown[]) => unknown;

/**
 * Replace any function values in `args` with `{ __callback__: id }` markers
 * so the args become structured-clone-safe. The runtime is responsible for
 * holding strong references to the registered callbacks until termination —
 * see the worker's callback registry. Non-function args pass through.
 *
 * Recurses into plain arrays and plain object property values. Stops at
 * DomHandles and any object whose prototype is not Object/Array (e.g.
 * Date, Map) since structured-clone handles those natively and we don't
 * want to mutate them.
 */
export function encodeCallbacks(
  args: unknown[],
  registerCallback: (fn: (...a: unknown[]) => unknown) => number,
): unknown[] {
  return args.map((a) => encodeOne(a, registerCallback));
}

function encodeOne(value: unknown, register: (fn: (...a: unknown[]) => unknown) => number): unknown {
  if (typeof value === 'function') {
    const id = register(value as (...a: unknown[]) => unknown);
    return { [CALLBACK_MARKER_KEY]: id };
  }
  if (Array.isArray(value)) {
    return value.map((v) => encodeOne(v, register));
  }
  if (isHandle(value)) return value;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = encodeOne((value as Record<string, unknown>)[k], register);
    }
    return out;
  }
  return value;
}

/**
 * Decode the args payload coming back from the host inside a callback
 * invocation. Any `{ __handle: ... }` marker becomes a DOM proxy wrapping
 * that host-side element so the worker callback can do
 * `event.target.tagName` etc. Plain values pass through.
 */
export function decodeCallbackArgs(args: unknown[], callSync: CallSync): unknown[] {
  return args.map((a) => decodeOne(a, callSync));
}

function decodeOne(value: unknown, callSync: CallSync): unknown {
  if (isHandle(value)) return createDomProxy(value, callSync);
  if (Array.isArray(value)) {
    return value.map((v) => decodeOne(v, callSync));
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = decodeOne((value as Record<string, unknown>)[k], callSync);
    }
    return out;
  }
  return value;
}

export function createDomProxy(handle: DomHandle, callSync: CallSync): unknown {
  return new Proxy({ __handle: handle.__handle } as DomHandle, {
    get(target, prop) {
      if (prop === '__handle') return target.__handle;
      if (typeof prop !== 'string') return undefined;
      const result = callSync('property-get', [target.__handle, prop]);
      if (isHandle(result)) return createDomProxy(result, callSync);
      if (isMethodMarker(result)) {
        return (...args: unknown[]) => {
          // Hand raw args to callSync. The runtime's callSync impl
          // (see worker source) is responsible for swapping function
          // values in `args` for `{ __callback__: id }` markers
          // before they cross the postMessage/SAB boundary; this
          // proxy stays agnostic of registration state.
          const r = callSync('method-call', [target.__handle, prop, args]);
          if (isHandle(r)) return createDomProxy(r, callSync);
          return r;
        };
      }
      return result;
    },
    set(target, prop, value) {
      if (typeof prop !== 'string') return false;
      callSync('property-set', [target.__handle, prop, value]);
      return true;
    },
    has(target, prop) {
      if (typeof prop !== 'string') return false;
      return !!callSync('property-has', [target.__handle, prop]);
    },
  });
}
