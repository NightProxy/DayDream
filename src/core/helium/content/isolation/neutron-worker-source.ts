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
    const encoded = op === 'method-call' ? encodeCallbacks(args, registerCallback) : args;
    return send({ type: `dom.${op}`, args: encoded }, true);
  };

  self.addEventListener('message', (e: MessageEvent) => {
    const data = e.data;

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

  (globalThis as any).chrome = chrome;
  (globalThis as any).document = documentProxy;
  (globalThis as any).window = windowProxy;
  installDomConstructorStubs();

  try {
    new Function('chrome', '"use strict";\n' + scriptBody)(chrome);
  } catch (err) {
    console.error('[helium/content/iso/neutron-worker] script error:', err);
  }
}

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
  const ctor = class {} as unknown as {
    new (): unknown;
    prototype: Record<string, unknown>;
  };
  try {
    Object.defineProperty(ctor, 'name', { value: name, configurable: true });
  } catch { /* readonly in strict envs — ignore */ }
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
  const Document = makeDomCtor('Document', ['_document_', 'document']);
  if (g.Document === undefined) g.Document = Document;
  if (g.HTMLDocument === undefined) g.HTMLDocument = makeDomCtor('HTMLDocument', ['_document_', 'document']);
  if (g.XMLDocument === undefined) g.XMLDocument = makeDomCtor('XMLDocument', ['_document_', 'xml']);
  if (g.DocumentFragment === undefined) g.DocumentFragment = makeDomCtor('DocumentFragment', ['fragment']);
  if (g.ShadowRoot === undefined) g.ShadowRoot = makeDomCtor('ShadowRoot', ['shadow']);

  if (g.Window === undefined) g.Window = makeDomCtor('Window', ['_window_', 'window']);

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
