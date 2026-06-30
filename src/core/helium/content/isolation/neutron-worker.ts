/**
 * Spawns a Worker, attaches Neutron to it, evaluates the content
 * script body inside the worker, and bridges DOM access back via
 * synchronous Neutron sends (worker-side `send()` blocks on SAB
 * until host's async DOM op completes).
 *
 * One worker per ISOLATED-mode content script. Worker startup adds
 * ~5-15 ms latency to script-run. Acceptable.
 */

import { Neutron } from 'neutron';
import { neutronWorkerSrc } from './neutron-worker-loader';
import { ChromeMiniInstance } from '../mini-chrome-instance';

const handleStore = new Map<string, unknown>();
let nextHandleId = 0;

function storeHandle(el: unknown): string {
  const id = `h${nextHandleId++}`;
  handleStore.set(id, el);
  return id;
}

function resolveHandle(id: string): unknown {
  if (id === '_document_') return document;
  if (id === '_window_') return window;
  return handleStore.get(id);
}

const CALLBACK_MARKER_KEY = '__callback__';
const CALLBACK_INVOKE_TYPE = 'helium.cb';

interface CallbackMarker {
  [CALLBACK_MARKER_KEY]: number;
}

function isCallbackMarker(v: unknown): v is CallbackMarker {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>)[CALLBACK_MARKER_KEY] === 'number'
  );
}

/**
 * Convert a host-side value into a structured-clone-safe payload for
 * postMessage delivery to the worker. DOM nodes become `{__handle: id}`
 * markers (resolved back into proxies on the worker side); Event objects
 * become plain projections of their useful fields; everything else
 * passes through structuredClone, or null if that fails.
 *
 * We don't try to be exhaustive about every Event subclass — just enough
 * fields that typical content-script handlers don't immediately fall
 * over. Extra subclass-specific fields are passed through `structuredClone`
 * on each property where possible.
 */
function serializeForWorker(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function' || t === 'symbol') return undefined;

  if (typeof (value as { nodeType?: unknown }).nodeType === 'number') {
    return { __handle: storeHandle(value) };
  }

  if (typeof Event !== 'undefined' && value instanceof Event) {
    return projectEvent(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeForWorker);
  }

  if (Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = serializeForWorker((value as Record<string, unknown>)[k]);
    }
    return out;
  }

  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}

const EVENT_BASE_KEYS: readonly string[] = [
  'type', 'bubbles', 'cancelable', 'composed', 'defaultPrevented',
  'eventPhase', 'isTrusted', 'timeStamp', 'returnValue', 'cancelBubble',
];

const EVENT_SUBCLASS_KEYS: Record<string, readonly string[]> = {
  MouseEvent: ['clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY',
               'button', 'buttons', 'altKey', 'ctrlKey', 'shiftKey', 'metaKey',
               'movementX', 'movementY', 'offsetX', 'offsetY'],
  KeyboardEvent: ['key', 'code', 'keyCode', 'which', 'location', 'repeat',
                  'altKey', 'ctrlKey', 'shiftKey', 'metaKey', 'isComposing'],
  WheelEvent: ['deltaX', 'deltaY', 'deltaZ', 'deltaMode'],
  InputEvent: ['data', 'inputType', 'isComposing'],
  CompositionEvent: ['data'],
  FocusEvent: [],
  PointerEvent: ['pointerId', 'pointerType', 'pressure', 'tangentialPressure',
                 'tiltX', 'tiltY', 'twist', 'width', 'height', 'isPrimary'],
  MessageEvent: ['data', 'origin', 'lastEventId'],
  HashChangeEvent: ['oldURL', 'newURL'],
  PopStateEvent: [], // `state` may not be clonable
  CustomEvent: [], // `detail` handled separately below
};

function projectEvent(ev: Event): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EVENT_BASE_KEYS) {
    try {
      out[k] = (ev as unknown as Record<string, unknown>)[k];
    } catch { /* getter threw — skip */ }
  }

  const target = (ev as unknown as { target?: unknown }).target;
  if (target) out.target = serializeForWorker(target);
  const currentTarget = (ev as unknown as { currentTarget?: unknown }).currentTarget;
  if (currentTarget) out.currentTarget = serializeForWorker(currentTarget);
  const relatedTarget = (ev as unknown as { relatedTarget?: unknown }).relatedTarget;
  if (relatedTarget) out.relatedTarget = serializeForWorker(relatedTarget);

  const ctorName = (ev.constructor && ev.constructor.name) || '';
  const extraKeys = EVENT_SUBCLASS_KEYS[ctorName];
  if (extraKeys) {
    for (const k of extraKeys) {
      try {
        const v = (ev as unknown as Record<string, unknown>)[k];
        if (v !== undefined) out[k] = serializeForWorker(v);
      } catch { /* skip */ }
    }
  }

  if (ctorName === 'CustomEvent') {
    try {
      out.detail = serializeForWorker((ev as CustomEvent).detail);
    } catch { /* skip */ }
  }

  return out;
}

/**
 * Walk an args array (the worker-supplied args destined for `fn.apply`),
 * replacing each `{ __callback__: id }` marker with a real function that
 * posts the invocation back into the worker.
 */
function substituteCallbacks(args: unknown[], neutron: Neutron): unknown[] {
  return args.map((a) => substituteOne(a, neutron));
}

function substituteOne(value: unknown, neutron: Neutron): unknown {
  if (isCallbackMarker(value)) {
    const id = value[CALLBACK_MARKER_KEY];
    return (...realArgs: unknown[]) => {
      try {
        neutron.postToWorker({
          type: CALLBACK_INVOKE_TYPE,
          id,
          args: realArgs.map(serializeForWorker),
        });
      } catch (err) {
        console.error('[helium/content/iso/neutron-worker] postToWorker failed:', err);
      }
    };
  }
  if (Array.isArray(value)) return value.map((v) => substituteOne(v, neutron));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = substituteOne((value as Record<string, unknown>)[k], neutron);
    }
    return out;
  }
  return value;
}

export function runNeutron(ctx: any, scriptKey: string, scriptBody: string): void {
  const blob = new Blob([neutronWorkerSrc], { type: 'text/javascript' });
  const workerUrl = URL.createObjectURL(blob);

  const chromeInstance = new ChromeMiniInstance(ctx, scriptKey, { skipRegistration: true });

  const neutron = new Neutron({
    workerUrl,
    workerOptions: { type: 'classic' },
    bootstrap: { ctx, scriptKey, scriptBody },
  });

  try {
    const w = window as {
      extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
      tabs?: { activeTabId?: string | null };
    };
    if (w.extDevtools) {
      const workerRef = (neutron as unknown as { worker: Worker }).worker;
      if (workerRef) {
        const tabId = w.tabs?.activeTabId ?? 'unknown';
        const label = scriptKey.split(':').slice(-3, -2)[0] ?? 'content-script';
        let urlString = '';
        try {
          urlString = location.href;
        } catch {
          /* ignore */
        }
        w.extDevtools.targetRegistry.register({
          extId: ctx.id,
          targetId: `content-script::${tabId}::${scriptKey}`,
          kind: 'content-script',
          worker: workerRef,
          tabId,
          scriptKey,
          url: urlString,
          label,
        });
      }
    }
  } catch (err) {
    console.warn('[helium/content/iso/neutron-worker] register content-script target failed:', err);
  }

  neutron.on('chrome.runtime.sendMessage', async (req) => {
    return chromeInstance.runtime.sendMessage(...(req['args'] as unknown[]));
  });
  neutron.on('chrome.storage.local.get', async (req) =>
    chromeInstance.storage.local.get(...(req['args'] as unknown[])));
  neutron.on('chrome.storage.local.set', async (req) =>
    chromeInstance.storage.local.set(...(req['args'] as unknown[])));
  neutron.on('chrome.storage.local.remove', async (req) =>
    chromeInstance.storage.local.remove(...(req['args'] as unknown[])));
  neutron.on('chrome.storage.local.clear', async () =>
    chromeInstance.storage.local.clear());
  neutron.on('chrome.tabs.query', async (req) =>
    chromeInstance.tabs.query(...(req['args'] as unknown[])));
  neutron.on('chrome.tabs.create', async (req) =>
    chromeInstance.tabs.create(...(req['args'] as unknown[])));

  neutron.on('dom.property-get', async (req) => {
    const [handle, prop] = req['args'] as [string, string];
    const el = resolveHandle(handle);
    if (!el) return undefined;
    const v = (el as any)[prop];
    if (typeof v === 'function') return { __method__: true, name: prop };
    if (v && typeof v === 'object' && (v as any).nodeType !== undefined) {
      return { __handle: storeHandle(v) };
    }
    return v;
  });
  neutron.on('dom.property-set', async (req) => {
    const [handle, prop, value] = req['args'] as [string, string, unknown];
    const el = resolveHandle(handle);
    if (el) (el as any)[prop] = value;
    return undefined;
  });
  neutron.on('dom.property-has', async (req) => {
    const [handle, prop] = req['args'] as [string, string];
    const el = resolveHandle(handle);
    return el ? prop in (el as any) : false;
  });
  neutron.on('dom.method-call', async (req) => {
    const [handle, method, args] = req['args'] as [string, string, unknown[]];
    const el = resolveHandle(handle);
    if (!el) return undefined;
    const fn = (el as any)[method];
    if (typeof fn !== 'function') return undefined;
    const finalArgs = substituteCallbacks(args, neutron);
    const r = fn.apply(el, finalArgs);
    if (r && typeof r === 'object' && (r as any).nodeType !== undefined) {
      return { __handle: storeHandle(r) };
    }
    return r;
  });

  window.addEventListener('pagehide', () => {
    try { void neutron.terminate(); } catch { /* ignore */ }
    try { URL.revokeObjectURL(workerUrl); } catch { /* ignore */ }
    try {
      const w = window as {
        extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
        tabs?: { activeTabId?: string | null };
      };
      const tabId = w.tabs?.activeTabId ?? 'unknown';
      w.extDevtools?.targetRegistry.unregister(
        ctx.id,
        `content-script::${tabId}::${scriptKey}`,
      );
    } catch (err) {
      console.warn('[helium/content/iso/neutron-worker] unregister target threw:', err);
    }
  }, { once: true });
}
