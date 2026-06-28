/**
 * Entry point for the Neutron content-script worker. This module is
 * the input to the neutron-worker rolldown bundle. Once bundled into
 * dist/neutron-worker.js as an IIFE, it's served to the Worker
 * constructor via a Blob URL.
 *
 * Inside the worker:
 *   - Receive init message with { lengthBuffer, valueBuffer, bootstrap }
 *   - bootstrap.scriptBody is the user's content script source
 *   - Build a synthetic chrome global routed through Neutron.send
 *   - Build a synthetic document via createDomProxy
 *   - Evaluate the script body
 */

import { init, send } from 'neutron/worker';
import {
  createDomProxy,
  decodeCallbackArgs,
  encodeCallbacks,
  isCallbackInvocation,
  type CallSync,
} from './dom-proxy';

// ─────────────────────────────────────────────────────────────────────────
// Worker-side callback registry.
//
// When a content script passes a function across the worker→host boundary
// (e.g. `document.addEventListener('click', fn)`), the function cannot be
// structured-cloned through postMessage. Instead we register it locally,
// hand the host a `{ __callback__: id }` marker, and the host substitutes a
// shim function that, when invoked, posts back here via the regular
// postMessage channel so we can look the callback up and call it.
//
// Callbacks live forever — there's no GC signal because both sides can
// hold strong refs. For ISOLATED content scripts (one worker per script,
// torn down on page unload) this is fine: the registry dies with the worker.
// ─────────────────────────────────────────────────────────────────────────
const callbackRegistry = new Map<number, (...a: unknown[]) => unknown>();
let nextCallbackId = 0;

function registerCallback(fn: (...a: unknown[]) => unknown): number {
  const id = nextCallbackId++;
  callbackRegistry.set(id, fn);
  return id;
}

self.addEventListener('message', (e: MessageEvent) => {
  const data = e.data as any;
  if (!data?.lengthBuffer || !data?.valueBuffer) return;
  init({
    lengthBuffer: data.lengthBuffer,
    valueBuffer: data.valueBuffer,
  });
  const bootstrap = data.bootstrap as { ctx: any; scriptKey: string; scriptBody: string };
  bootWorker(bootstrap);
}, { once: true });

function bootWorker(bootstrap: { ctx: any; scriptKey: string; scriptBody: string }): void {
  const { ctx, scriptBody } = bootstrap;

  const callSync: CallSync = (op, args) => {
    // For method-call we need to swap any function args for callback
    // markers so postMessage doesn't choke trying to structured-clone
    // them. Other ops (property-get/set/has) don't carry user-supplied
    // functions, so the walk is a no-op for them, but doing it
    // uniformly keeps the wire format consistent.
    const encoded = op === 'method-call' ? encodeCallbacks(args, registerCallback) : args;
    return send({ type: `dom.${op}`, args: encoded }, true);
  };

  // Persistent listener for host→worker callback invocations and other
  // helium-tagged out-of-band messages. The init listener above is
  // `{ once: true }`, so we install this AFTER init has consumed its
  // message and won't intercept anything else.
  self.addEventListener('message', (e: MessageEvent) => {
    const data = e.data;

    // Callback invocation: host calling a function the worker previously
    // registered via the __callback__ marker.
    if (isCallbackInvocation(data)) {
      const fn = callbackRegistry.get(data.id);
      if (!fn) {
        console.warn('[helium/content/iso/neutron-worker] callback invocation for unknown id:', data.id);
        return;
      }
      const decodedArgs = decodeCallbackArgs(data.args, callSync);
      try {
        fn(...decodedArgs);
      } catch (err) {
        console.error('[helium/content/iso/neutron-worker] callback threw:', err);
      }
      return;
    }

    // DevTools attach: host hands us the worker-flavoured chobitsu agent
    // and asks us to eval it. The agent installs its own message
    // listener afterwards for CDP traffic (worker-in / worker-out).
    if (
      data &&
      typeof data === 'object' &&
      (data as { type?: unknown }).type === 'helium.devtools.worker-attach'
    ) {
      const att = data as {
        src?: unknown;
        frameId?: unknown;
        url?: unknown;
        title?: unknown;
      };
      if (
        typeof att.src !== 'string' ||
        typeof att.frameId !== 'string' ||
        typeof att.url !== 'string' ||
        typeof att.title !== 'string'
      ) {
        console.warn('[helium/content/iso/neutron-worker] devtools attach: malformed payload');
        return;
      }
      try {
        // Indirect eval so the agent source runs at worker-global scope.
        (0, eval)(att.src);
        const boot = (self as unknown as {
          __ddxDevtoolsWorkerAgentBoot__?: (init: unknown) => void;
        }).__ddxDevtoolsWorkerAgentBoot__;
        if (typeof boot !== 'function') {
          console.warn(
            '[helium/content/iso/neutron-worker] devtools attach: agent did not expose boot',
          );
          return;
        }
        boot({ frameId: att.frameId, url: att.url, title: att.title });
      } catch (err) {
        console.error('[helium/content/iso/neutron-worker] devtools attach failed:', err);
      }
      return;
    }
  });

  // Build chrome global
  const chrome = {
    runtime: {
      id: ctx.id,
      getURL: (path: string) =>
        `https://${ctx.origin}/${(path || '').replace(/^\/+/, '')}`,
      getManifest: () => ctx.manifest,
      sendMessage: (...args: unknown[]) =>
        send({ type: 'chrome.runtime.sendMessage', args }, true),
      lastError: null as null | { message: string },
    },
    extension: {
      getURL: (path: string) =>
        `https://${ctx.origin}/${(path || '').replace(/^\/+/, '')}`,
    },
    storage: {
      local: {
        get: (k?: unknown) => send({ type: 'chrome.storage.local.get', args: [k] }, true),
        set: (i: unknown)  => send({ type: 'chrome.storage.local.set', args: [i] }, true),
        remove: (k: unknown) => send({ type: 'chrome.storage.local.remove', args: [k] }, true),
        clear: () => send({ type: 'chrome.storage.local.clear', args: [] }, true),
      },
      session: {
        get: (k?: unknown) => send({ type: 'chrome.storage.session.get', args: [k] }, true),
        set: (i: unknown)  => send({ type: 'chrome.storage.session.set', args: [i] }, true),
        remove: (k: unknown) => send({ type: 'chrome.storage.session.remove', args: [k] }, true),
        clear: () => send({ type: 'chrome.storage.session.clear', args: [] }, true),
      },
      managed: {
        get: (k?: unknown) => send({ type: 'chrome.storage.managed.get', args: [k] }, true),
      },
    },
    tabs: {
      query:  (info: unknown) => send({ type: 'chrome.tabs.query', args: [info] }, true),
      create: (info: unknown) => send({ type: 'chrome.tabs.create', args: [info] }, true),
    },
  };

  const documentProxy = createDomProxy(
    { __handle: '_document_' },
    callSync,
  );
  const windowProxy = createDomProxy(
    { __handle: '_window_' },
    callSync,
  );

  // Install globals
  (globalThis as any).chrome = chrome;
  (globalThis as any).document = documentProxy;
  (globalThis as any).window = windowProxy;
  installDomConstructorStubs();

  // Evaluate the script body
  try {
    new Function('chrome', '"use strict";\n' + scriptBody)(chrome);
  } catch (err) {
    console.error('[helium/content/iso/neutron-worker] script error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DOM constructor stubs
//
// Web Workers don't expose DOM constructors (HTMLDocument, HTMLElement,
// Node, etc.) because workers have no DOM. Real-world content scripts
// — uBlock Origin, AdGuard, jQuery, lodash's `isElement`, basically
// everything — reference these constructors for `instanceof` checks,
// `typeof` guards, or prototype patching. Without stubs they throw
// `ReferenceError: HTMLDocument is not defined` and the entire script
// aborts before doing anything useful.
//
// Strategy:
//   - Install a no-op class for each common DOM constructor.
//   - Override `Symbol.hasInstance` so `x instanceof HTMLDocument` looks
//     at our DOM proxy's `__handle` (set by createDomProxy) to decide.
//     For now we do a coarse prefix match — good enough for the common
//     "is this the document object?" / "is this a window?" patterns.
//     Anything more precise would need a synchronous RPC per check,
//     which is too expensive. Returning `false` for an unknown handle
//     is safe: content scripts treat a `false` instanceof the same way
//     as "not a DOM object", which is true from their perspective.
//   - `.prototype` is a plain object — prototype-patching code stores
//     monkey-patches there but they'll never be called because real
//     DOM nodes live in the host realm. This is acceptable: the patch
//     is a no-op rather than a crash.
//
// Type list pulled from the Window IDL types that content scripts most
// frequently reference. Add to this list if more turn up in real
// extensions.
// ─────────────────────────────────────────────────────────────────────────

const HANDLE_KEY = '__handle';

interface HasHandle { [HANDLE_KEY]?: string }

function getHandle(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined;
  try {
    return (v as HasHandle)[HANDLE_KEY];
  } catch {
    return undefined;
  }
}

/**
 * Build a stub constructor whose `instanceof` returns true for any
 * DomHandle whose `__handle` matches one of `handlePatterns`. Match
 * is by substring so e.g. `'HTMLDocument'` matches handles named
 * `_document_` because we add that mapping below.
 */
function makeDomCtor(name: string, handleMatchers: string[]): unknown {
  // Use a real class so `typeof X === 'function'` and `X.prototype`
  // is a normal object. We never expect anyone to call `new X()` —
  // if they do, they'll get an instance whose prototype chain leads
  // back to our stub. That's fine.
  const ctor = class {} as unknown as {
    new (): unknown;
    prototype: Record<string, unknown>;
  };
  // Name it via Object.defineProperty so `ctor.name === 'HTMLDocument'`
  // for any introspection code that pivots on constructor names.
  try {
    Object.defineProperty(ctor, 'name', { value: name, configurable: true });
  } catch { /* readonly in strict envs — ignore */ }
  // Override hasInstance to handle our proxy objects.
  Object.defineProperty(ctor, Symbol.hasInstance, {
    value: (instance: unknown) => {
      const h = getHandle(instance);
      if (typeof h !== 'string') return false;
      for (const matcher of handleMatchers) {
        if (h.includes(matcher)) return true;
      }
      return false;
    },
    configurable: true,
  });
  return ctor;
}

function installDomConstructorStubs(): void {
  const g = globalThis as Record<string, unknown>;
  // Document family. Our document proxy carries handle '_document_'.
  // Aliases that some scripts test for: HTMLDocument (legacy), Document.
  const Document = makeDomCtor('Document', ['_document_', 'document']);
  if (g.Document === undefined) g.Document = Document;
  // HTMLDocument is an alias for Document in modern browsers (still
  // a separate constructor in WebIDL but shares prototype methods).
  if (g.HTMLDocument === undefined) g.HTMLDocument = makeDomCtor('HTMLDocument', ['_document_', 'document']);
  if (g.XMLDocument === undefined) g.XMLDocument = makeDomCtor('XMLDocument', ['_document_', 'xml']);
  if (g.DocumentFragment === undefined) g.DocumentFragment = makeDomCtor('DocumentFragment', ['fragment']);
  if (g.ShadowRoot === undefined) g.ShadowRoot = makeDomCtor('ShadowRoot', ['shadow']);

  // Window family. Our window proxy carries handle '_window_'.
  if (g.Window === undefined) g.Window = makeDomCtor('Window', ['_window_', 'window']);

  // Node hierarchy. We don't track DOM node sub-types in our handle
  // strings yet, so all of these have empty matchers — `instanceof`
  // returns false for any DOM-proxy. That's still better than throwing
  // ReferenceError and lets `typeof Node === 'function'` succeed.
  if (g.Node === undefined) g.Node = makeDomCtor('Node', []);
  if (g.Element === undefined) g.Element = makeDomCtor('Element', []);
  if (g.HTMLElement === undefined) g.HTMLElement = makeDomCtor('HTMLElement', []);
  if (g.SVGElement === undefined) g.SVGElement = makeDomCtor('SVGElement', []);
  if (g.Text === undefined) g.Text = makeDomCtor('Text', []);
  if (g.Comment === undefined) g.Comment = makeDomCtor('Comment', []);
  if (g.Attr === undefined) g.Attr = makeDomCtor('Attr', []);
  if (g.CharacterData === undefined) g.CharacterData = makeDomCtor('CharacterData', []);
  if (g.CDATASection === undefined) g.CDATASection = makeDomCtor('CDATASection', []);
  if (g.ProcessingInstruction === undefined) g.ProcessingInstruction = makeDomCtor('ProcessingInstruction', []);
  if (g.DocumentType === undefined) g.DocumentType = makeDomCtor('DocumentType', []);

  // Common HTMLElement subclasses that extension scripts test for.
  // Most uBlock Origin / AdGuard / privacy-extension matchers go
  // through these. List is non-exhaustive — add more as needed.
  const HTML_TAGS = [
    'HTMLAnchorElement', 'HTMLAreaElement', 'HTMLAudioElement', 'HTMLBaseElement',
    'HTMLBodyElement', 'HTMLBRElement', 'HTMLButtonElement', 'HTMLCanvasElement',
    'HTMLDataElement', 'HTMLDataListElement', 'HTMLDetailsElement', 'HTMLDialogElement',
    'HTMLDivElement', 'HTMLDListElement', 'HTMLEmbedElement', 'HTMLFieldSetElement',
    'HTMLFormElement', 'HTMLHeadElement', 'HTMLHeadingElement', 'HTMLHRElement',
    'HTMLHtmlElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLInputElement',
    'HTMLLabelElement', 'HTMLLegendElement', 'HTMLLIElement', 'HTMLLinkElement',
    'HTMLMapElement', 'HTMLMediaElement', 'HTMLMenuElement', 'HTMLMetaElement',
    'HTMLMeterElement', 'HTMLModElement', 'HTMLObjectElement', 'HTMLOListElement',
    'HTMLOptGroupElement', 'HTMLOptionElement', 'HTMLOutputElement', 'HTMLParagraphElement',
    'HTMLParamElement', 'HTMLPictureElement', 'HTMLPreElement', 'HTMLProgressElement',
    'HTMLQuoteElement', 'HTMLScriptElement', 'HTMLSelectElement', 'HTMLSlotElement',
    'HTMLSourceElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLTableCaptionElement',
    'HTMLTableCellElement', 'HTMLTableColElement', 'HTMLTableElement', 'HTMLTableRowElement',
    'HTMLTableSectionElement', 'HTMLTemplateElement', 'HTMLTextAreaElement', 'HTMLTimeElement',
    'HTMLTitleElement', 'HTMLTrackElement', 'HTMLUListElement', 'HTMLVideoElement',
    'HTMLUnknownElement',
  ];
  for (const tag of HTML_TAGS) {
    if (g[tag] === undefined) g[tag] = makeDomCtor(tag, []);
  }

  // Event types — scripts often build/check Event instances. Same
  // strategy as above: stub constructor, empty matcher (instanceof
  // returns false), but the constructor exists so guards pass.
  const EVENT_TYPES = [
    'Event', 'CustomEvent', 'UIEvent', 'MouseEvent', 'KeyboardEvent',
    'WheelEvent', 'FocusEvent', 'InputEvent', 'TouchEvent', 'PointerEvent',
    'DragEvent', 'ClipboardEvent', 'CompositionEvent', 'HashChangeEvent',
    'MessageEvent', 'PageTransitionEvent', 'PopStateEvent', 'StorageEvent',
    'SubmitEvent', 'BeforeUnloadEvent',
  ];
  for (const evt of EVENT_TYPES) {
    if (g[evt] === undefined) g[evt] = makeDomCtor(evt, []);
  }

  // Misc DOM types that turn up in instanceof checks.
  const MISC = [
    'EventTarget', 'NodeList', 'HTMLCollection', 'NamedNodeMap',
    'DOMTokenList', 'CSSStyleDeclaration', 'StyleSheet', 'CSSStyleSheet',
    'CSSRule', 'Range', 'Selection', 'MutationObserver', 'MutationRecord',
    'IntersectionObserver', 'ResizeObserver', 'PerformanceObserver',
    'XPathResult', 'XPathExpression', 'XPathEvaluator',
    'DOMRect', 'DOMRectReadOnly', 'DOMPoint', 'DOMPointReadOnly',
    'DOMMatrix', 'DOMMatrixReadOnly', 'DOMQuad', 'DOMException',
    'DOMParser', 'XMLSerializer', 'DOMImplementation',
  ];
  for (const t of MISC) {
    if (g[t] === undefined) g[t] = makeDomCtor(t, []);
  }
}
