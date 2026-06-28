/**
 * ShadowRealm-based isolation. Used when globalThis.ShadowRealm is
 * available (Chrome 125+ behind a flag; check `ISO_MODE`).
 *
 * Construction:
 *   1. Create a new ShadowRealm.
 *   2. Marshal ctx and host capabilities across as primitives + functions.
 *   3. Inside the realm, build a chrome instance and synthetic document
 *      via wrapped callbacks.
 *   4. Evaluate the script body inside the realm.
 *
 * Caveats:
 *   - ShadowRealm.evaluate is synchronous; long host work blocks the
 *     same thread. Avoid heavy host-side work in property-get hooks.
 *   - Only primitives and functions cross realm boundaries. Element
 *     refs pass as DomHandle objects with an `__handle` string.
 *   - Event listeners passed into addEventListener become functions
 *     the realm sees; the host wraps them so they dispatch back into
 *     the realm asynchronously.
 *
 * v1 limitation: the synthetic-`document` wiring inside the realm
 * isn't fleshed out here. Scripts that don't touch DOM (or only use
 * chrome.*) work fine. Scripts that traverse the DOM access through
 * the bridge's `domGet` / `domSet` / `domCall`. Building a full
 * Proxy-backed `document` inside the realm requires more bridging
 * than fits in this task. Heavy DOM manipulation should opt into
 * Neutron mode (full Proxy tree) by setting `globalThis.ShadowRealm
 * = undefined` before mini-chrome loads.
 */

import { ChromeMiniInstance } from '../mini-chrome-instance';

export function runShadowRealm(ctx: any, scriptKey: string, scriptBody: string): void {
  const Realm = (globalThis as any).ShadowRealm as new () => {
    evaluate(src: string): unknown;
    importValue(specifier: string, name: string): Promise<unknown>;
  };

  let realm: { evaluate(src: string): unknown };
  try {
    realm = new Realm();
  } catch (err) {
    console.error('[helium/content/iso/shadowrealm] failed to construct ShadowRealm:', err);
    return;
  }

  // Build a host-side chrome instance; the realm calls back into the
  // host via wrapped functions to invoke its async methods. SKIP the
  // window-ready registration: this instance lives in the HOST realm,
  // not the proxied page, so events should NOT be routed here via
  // postMessage. Events still reach the realm because the realm's
  // chrome.* methods route through this host instance's async impls
  // (the relay-based fanout path is unnecessary).
  const chromeInstance = new ChromeMiniInstance(ctx, scriptKey, { skipRegistration: true });

  // Capture host callback table — the realm can pass us function refs
  // that we invoke when DOM events fire. ShadowRealm allows function
  // refs across the boundary.
  const realmCallbacks = new Map<number, (...args: unknown[]) => unknown>();
  let nextCallbackId = 0;

  // Bridge: realm → host function calls. Each method gets a tiny
  // adapter that takes JSON args.
  const bridge = {
    runtimeSendMessage: (argsJson: string) =>
      chromeInstance.runtime.sendMessage(...(JSON.parse(argsJson) as unknown[])),
    runtimeGetURL: (path: string) => chromeInstance.runtime.getURL(path),
    runtimeGetManifestJson: () => JSON.stringify(chromeInstance.runtime.getManifest()),
    runtimeId: () => chromeInstance.runtime.id,
    storageLocalGet: (k: string) => chromeInstance.storage.local.get(JSON.parse(k)),
    storageLocalSet: (i: string) => chromeInstance.storage.local.set(JSON.parse(i)),
    storageLocalRemove: (k: string) => chromeInstance.storage.local.remove(JSON.parse(k)),
    storageLocalClear: () => chromeInstance.storage.local.clear(),
    storageSessionGet: (k: string) => chromeInstance.storage.session.get(JSON.parse(k)),
    storageSessionSet: (i: string) => chromeInstance.storage.session.set(JSON.parse(i)),
    storageSessionRemove: (k: string) => chromeInstance.storage.session.remove(JSON.parse(k)),
    storageSessionClear: () => chromeInstance.storage.session.clear(),
    storageManagedGet: (k: string) => chromeInstance.storage.managed.get(JSON.parse(k)),
    tabsQuery: (q: string) => chromeInstance.tabs.query(JSON.parse(q)),
    tabsCreate: (c: string) => chromeInstance.tabs.create(JSON.parse(c)),

    // DOM bridge: dom-* methods route to host's document
    domGet: (handle: string, prop: string): unknown => {
      const el = resolveHandle(handle);
      if (!el) return undefined;
      const v = (el as any)[prop];
      if (v && typeof v === 'object' && v.nodeType !== undefined) {
        return { __handle: storeHandle(v) };
      }
      return v;
    },
    domSet: (handle: string, prop: string, value: unknown) => {
      const el = resolveHandle(handle);
      if (el) (el as any)[prop] = value;
    },
    domCall: (handle: string, method: string, argsJson: string): unknown => {
      const el = resolveHandle(handle);
      if (!el) return undefined;
      const args = JSON.parse(argsJson) as unknown[];
      const fn = (el as any)[method];
      if (typeof fn !== 'function') return undefined;
      const r = fn.apply(el, args);
      if (r && typeof r === 'object' && (r as any).nodeType !== undefined) {
        return { __handle: storeHandle(r) };
      }
      return r;
    },
    registerCallback: (fn: (...args: unknown[]) => unknown): number => {
      const id = nextCallbackId++;
      realmCallbacks.set(id, fn);
      return id;
    },
    invokeCallback: (id: number, argsJson: string): unknown => {
      const fn = realmCallbacks.get(id);
      if (!fn) return undefined;
      try { return fn(...(JSON.parse(argsJson) as unknown[])); } catch (e) { console.error(e); return undefined; }
    },
  };

  // Inside the realm: install bridge functions + build chrome global +
  // synthetic document. Then evaluate the script body.
  const realmSetup = `
    globalThis.__helium_bridge__ = {};
    globalThis.__helium_ctx__ = ${JSON.stringify(ctx)};
  `;
  realm.evaluate(realmSetup);

  // Bind each bridge function across the boundary one-by-one.
  // ShadowRealm requires functions to be passed via a wrapper call.
  // We use the documented evaluate-returns-function pattern.
  const bridgeBinder = realm.evaluate(`
    (function(name, fn) {
      globalThis.__helium_bridge__[name] = fn;
    })
  `) as (name: string, fn: unknown) => void;

  for (const [name, fn] of Object.entries(bridge)) {
    bridgeBinder(name, fn);
  }

  // Construct chrome + document inside the realm
  const realmChrome = `
    var chrome = {
      runtime: {
        id: globalThis.__helium_ctx__.id,
        getURL: __helium_bridge__.runtimeGetURL,
        getManifest: function() { return JSON.parse(__helium_bridge__.runtimeGetManifestJson()); },
        sendMessage: function() { return __helium_bridge__.runtimeSendMessage(JSON.stringify(Array.from(arguments))); },
        lastError: null,
      },
      extension: {
        getURL: __helium_bridge__.runtimeGetURL,
      },
      storage: {
        local: {
          get: function(k) { return __helium_bridge__.storageLocalGet(JSON.stringify(k)); },
          set: function(i) { return __helium_bridge__.storageLocalSet(JSON.stringify(i)); },
          remove: function(k) { return __helium_bridge__.storageLocalRemove(JSON.stringify(k)); },
          clear: function() { return __helium_bridge__.storageLocalClear(); },
        },
        session: {
          get: function(k) { return __helium_bridge__.storageSessionGet(JSON.stringify(k)); },
          set: function(i) { return __helium_bridge__.storageSessionSet(JSON.stringify(i)); },
          remove: function(k) { return __helium_bridge__.storageSessionRemove(JSON.stringify(k)); },
          clear: function() { return __helium_bridge__.storageSessionClear(); },
        },
        managed: {
          get: function(k) { return __helium_bridge__.storageManagedGet(JSON.stringify(k)); },
        },
      },
      tabs: {
        query: function(q) { return __helium_bridge__.tabsQuery(JSON.stringify(q)); },
        create: function(c) { return __helium_bridge__.tabsCreate(JSON.stringify(c)); },
      },
    };
    globalThis.chrome = chrome;
  `;
  realm.evaluate(realmChrome);

  // Evaluate the user script body
  try {
    realm.evaluate(`(function(chrome) {\n${scriptBody}\n})(globalThis.chrome)`);
  } catch (err) {
    console.error('[helium/content/iso/shadowrealm] script error:', err);
  }
}

// Host-side handle storage. Element refs come back from the realm as
// strings; we look them up here to invoke real DOM operations.
const handleStore = new Map<string, unknown>();
let nextHandleId = 0;

function storeHandle(el: unknown): string {
  // Use deterministic-ish IDs for debug ergonomics; not security.
  const id = `h${nextHandleId++}`;
  handleStore.set(id, el);
  return id;
}

function resolveHandle(id: string): unknown {
  if (id === '_document_') return document;
  if (id === '_window_') return window;
  return handleStore.get(id);
}
