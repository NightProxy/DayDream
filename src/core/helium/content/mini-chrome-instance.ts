/**
 * The chrome global construction for content scripts. One instance
 * per (extension, scriptKey) pair. Multiple instances may coexist
 * in a single page (different extensions, or different rules of the
 * same extension).
 */

let nextReqId = 0;
const pending = new Map<number, {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}>();

// Per-page instance registry: keyed by extId, holds every chrome
// instance constructed for content scripts of that extension.
// Used to fan inbound `event` messages from the host to the right
// instance(s).
const instances = new Map<string, Set<ChromeMiniInstance>>();

// Per-extension token for the host to address this window.
// One token per (extId, this window). Generated lazily on first
// instance construction per (extId).
const windowTokens = new Map<string, string>();

function tokenFor(extId: string): string {
  let t: string | undefined = windowTokens.get(extId);
  if (!t) {
    t = (crypto as any).randomUUID() as string;
    windowTokens.set(extId, t);
  }
  return t!;
}

class MiniChromeEvent {
  private listeners = new Set<(...args: unknown[]) => unknown>();
  addListener(fn: (...args: unknown[]) => unknown): void { this.listeners.add(fn); }
  removeListener(fn: (...args: unknown[]) => unknown): void { this.listeners.delete(fn); }
  hasListener(fn: (...args: unknown[]) => unknown): boolean { return this.listeners.has(fn); }
  hasListeners(): boolean { return this.listeners.size > 0; }
  _dispatch(args: unknown[]): unknown[] {
    const results: unknown[] = [];
    for (const fn of this.listeners) {
      try { results.push(fn(...args)); } catch (e) { console.error(e); results.push(undefined); }
    }
    return results;
  }
}

class Port {
  public readonly name: string;
  public readonly onMessage = new MiniChromeEvent();
  public readonly onDisconnect = new MiniChromeEvent();
  /** Set to true once either side has closed; idempotent. */
  public disconnected = false;
  /** Assigned by the host once port-opened arrives. -1 until then. */
  public portId = -1;

  constructor(name: string) { this.name = name; }

  postMessage(msg: unknown): void {
    if (this.disconnected) return;
    if (this.portId < 0) {
      console.warn('[helium/content] postMessage before port opened');
      return;
    }
    window.top!.postMessage({
      __helium_cs__: 'port-msg',
      portId: this.portId,
      message: msg,
    }, '*');
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    if (this.portId >= 0) {
      window.top!.postMessage({
        __helium_cs__: 'port-close',
        portId: this.portId,
      }, '*');
    }
    this.onDisconnect._dispatch([]);
  }
}

const ports = new Map<number, Port>();
const pendingPorts = new Map<number, Port>(); // keyed by pendingPortId before host assigns real portId
let nextPendingPortId = 0;

function callHostFor(
  instance: ChromeMiniInstance,
  extId: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  return new Promise((resolve) => {
    const reqId = nextReqId++;
    pending.set(reqId, {
      resolve: (v) => {
        instance.runtime.lastError = null;
        resolve(v);
      },
      reject: (e: Error) => {
        instance.runtime.lastError = { message: e.message };
        resolve(undefined);
      },
    });
    window.top!.postMessage({
      __helium_cs__: 'rpc-req',
      extId,
      method,
      args,
      reqId,
    }, '*');
  });
}

// Wraps a Promise-returning chrome.* method so that when the caller
// passes a callback function as the LAST argument, the wrapper invokes
// the callback with the resolved value (or undefined on rejection) and
// returns undefined — matching Chrome's MV2 callback contract. When no
// callback is supplied, returns the Promise (MV3 behavior).
//
// Note: callHostFor never rejects (it resolves(undefined) on error and
// stores the error on instance.runtime.lastError), so the wrapper
// observes either a value or undefined from the underlying call.
function makeCallbackAware(
  impl: (...args: unknown[]) => Promise<unknown>,
): (...args: unknown[]) => Promise<unknown> | undefined {
  return (...args: unknown[]) => {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      const cb = last as (r?: unknown) => void;
      const rest = args.slice(0, -1);
      impl(...rest).then(
        (r) => { try { cb(r); } catch (e) { console.error(e); } },
        (e) => { try { cb(undefined); console.warn('[helium/cs]', e); } catch (er) { console.error(er); } },
      );
      return undefined;
    }
    return impl(...args);
  };
}

function createPort(
  instance: ChromeMiniInstance,
  extId: string,
  args: unknown[],
): Port {
  // Signatures: connect(connectInfo?) or connect(extensionId, connectInfo?)
  let targetExtId = extId;
  let name = '';
  if (typeof args[0] === 'string') {
    targetExtId = args[0];
    if (args[1] && typeof args[1] === 'object' && 'name' in (args[1] as any)) {
      name = (args[1] as { name: string }).name ?? '';
    }
  } else if (args[0] && typeof args[0] === 'object') {
    name = ((args[0] as { name?: string }).name ?? '');
  }

  const port = new Port(name);
  const pendingId = nextPendingPortId++;
  pendingPorts.set(pendingId, port);
  window.top!.postMessage({
    __helium_cs__: 'port-connect',
    ownerExtId: extId,
    targetExtId,
    name,
    pendingId,
    scriptKey: instance.scriptKey,
  }, '*');
  return port;
}

export class ChromeMiniInstance {
  public readonly runtime: any;
  public readonly storage: any;
  public readonly tabs: any;
  public readonly extension: any;
  public readonly scriptKey: string;
  public readonly extId: string;

  constructor(ctx: any, scriptKey: string, opts?: { skipRegistration?: boolean }) {
    this.scriptKey = scriptKey;
    this.extId = ctx.id;

    if (!opts?.skipRegistration) {
      registerInstance(this.extId, this);
      // Send window-ready once per (extId, this window).
      const token = tokenFor(this.extId);
      window.top!.postMessage({
        __helium_cs__: 'window-ready',
        extId: this.extId,
        windowToken: token,
        scriptKey,
      }, '*');
    }

    const onChanged = new MiniChromeEvent();
    const onMessage = new MiniChromeEvent();
    const onConnect = new MiniChromeEvent();

    const baseUrl = `https://${ctx.origin}`;

    const call = (method: string) =>
      makeCallbackAware((...args: unknown[]) => callHostFor(this, this.extId, method, args));

    this.runtime = {
      id: ctx.id,
      getURL: (path: string) => `${baseUrl}/${(path || '').replace(/^\/+/, '')}`,
      getManifest: () => ctx.manifest,
      // sendMessage takes variadic chrome args; callback-aware
      sendMessage: makeCallbackAware((...args: unknown[]) =>
        callHostFor(this, this.extId, 'chrome.runtime.sendMessage', args),
      ),
      connect: (...args: unknown[]) => createPort(this, this.extId, args),
      onMessage,
      onConnect,
      lastError: null as null | { message: string },
    };

    this.extension = {
      getURL: (path: string) => this.runtime.getURL(path),
    };

    this.storage = {
      local: {
        get:    call('chrome.storage.local.get'),
        set:    call('chrome.storage.local.set'),
        remove: call('chrome.storage.local.remove'),
        clear:  call('chrome.storage.local.clear'),
        getBytesInUse: call('chrome.storage.local.getBytesInUse'),
      },
      sync: {
        get:    call('chrome.storage.sync.get'),
        set:    call('chrome.storage.sync.set'),
        remove: call('chrome.storage.sync.remove'),
        clear:  call('chrome.storage.sync.clear'),
        getBytesInUse: call('chrome.storage.sync.getBytesInUse'),
      },
      session: {
        get:    call('chrome.storage.session.get'),
        set:    call('chrome.storage.session.set'),
        remove: call('chrome.storage.session.remove'),
        clear:  call('chrome.storage.session.clear'),
        getBytesInUse: call('chrome.storage.session.getBytesInUse'),
      },
      managed: {
        get:    call('chrome.storage.managed.get'),
        getBytesInUse: call('chrome.storage.managed.getBytesInUse'),
      },
      onChanged,
    };

    this.tabs = {
      query:  call('chrome.tabs.query'),
      create: call('chrome.tabs.create'),
    };
  }

  _dispatchEvent(method: string, args: unknown[]): void {
    const parts = method.split('.');
    if (parts.length !== 3 || parts[0] !== 'chrome') return;
    const ns = (this as any)[parts[1]];
    const ev = ns?.[parts[2]];
    if (ev && typeof ev._dispatch === 'function') ev._dispatch(args);
  }
}

export function registerInstance(extId: string, instance: ChromeMiniInstance): void {
  let set = instances.get(extId);
  if (!set) {
    set = new Set();
    instances.set(extId, set);
  }
  set.add(instance);
}

export function unregisterAll(): void {
  for (const [extId, token] of windowTokens) {
    try {
      window.top!.postMessage({
        __helium_cs__: 'window-gone',
        extId,
        windowToken: token,
      }, '*');
    } catch { /* ignore */ }
  }
  instances.clear();
  windowTokens.clear();
}

// Inbound message router — host posts rpc-resp, event, port-msg,
// port-close, port-error, port-opened.
//
// Also handles BG→CS chrome.tabs.sendMessage routing (Task 10):
// the host posts `__helium_bg_to_cs__: 'msg'`, we dispatch to every
// registered ChromeMiniInstance's onMessage event, collect replies via
// a synthetic sendResponse, and post `__helium_bg_to_cs__: 'reply'`
// back to the source.
window.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || typeof data !== 'object') return;

  // BG→CS path (no scramjet envelope, comes from window.top postMessage)
  const bg = data as { __helium_bg_to_cs__?: string };
  if (bg.__helium_bg_to_cs__ === 'msg') {
    const m = data as {
      __helium_bg_to_cs__: 'msg';
      extId: string;
      message: unknown;
      sender: unknown;
      reqId: number;
    };
    const set = instances.get(m.extId);
    if (!set || set.size === 0) {
      try {
        (e.source as Window | null)?.postMessage(
          { __helium_bg_to_cs__: 'reply', reqId: m.reqId, response: undefined },
          '*',
        );
      } catch { /* ignore */ }
      return;
    }
    // Synthesize sendResponse — first call wins; subsequent calls are no-ops.
    let replied = false;
    const sendResponse = (resp: unknown): void => {
      if (replied) return;
      replied = true;
      try {
        (e.source as Window | null)?.postMessage(
          { __helium_bg_to_cs__: 'reply', reqId: m.reqId, response: resp },
          '*',
        );
      } catch { /* ignore */ }
    };
    let anyAsync = false;
    for (const inst of set) {
      const ev = inst.runtime.onMessage as MiniChromeEvent | undefined;
      if (!ev) continue;
      const results = ev._dispatch([m.message, m.sender, sendResponse]);
      if (results.some((r) => r === true)) anyAsync = true;
      if (replied) break;
    }
    if (!replied && !anyAsync) sendResponse(undefined);
    // 30s timeout fallback
    if (!replied) {
      setTimeout(() => { if (!replied) sendResponse(undefined); }, 30_000);
    }
    return;
  }

  // Unwrap scramjet envelope if present
  const raw = data as any;
  const m = raw.__helium_cs__
    ? raw
    : (raw.$scramjet$messagetype && raw.$scramjet$data?.__helium_cs__)
      ? raw.$scramjet$data
      : null;
  if (!m) return;

  switch (m.__helium_cs__) {
    case 'rpc-resp': {
      const p = pending.get(m.reqId);
      if (!p) return;
      pending.delete(m.reqId);
      if (m.error) {
        const err = new Error(m.error.message);
        err.name = m.error.name ?? 'Error';
        p.reject(err);
      } else {
        p.resolve(m.result);
      }
      return;
    }
    case 'event': {
      const set = instances.get(m.extId);
      if (!set) return;
      for (const inst of set) inst._dispatchEvent(m.method, m.args);
      return;
    }
    case 'port-opened': {
      const port = pendingPorts.get(m.pendingId);
      if (!port) return;
      pendingPorts.delete(m.pendingId);
      port.portId = m.portId;
      ports.set(m.portId, port);
      return;
    }
    case 'port-msg': {
      const port = ports.get(m.portId);
      if (!port) return;
      if (port.disconnected) return; // race: local already disconnected
      port.onMessage._dispatch([m.message]);
      return;
    }
    case 'port-close': {
      const port = ports.get(m.portId);
      if (!port || port.disconnected) return;
      port.disconnected = true;
      ports.delete(m.portId);
      port.onDisconnect._dispatch([]);
      return;
    }
    case 'port-error': {
      const port = pendingPorts.get(m.pendingId) ?? ports.get(m.portId);
      if (!port) return;
      port.disconnected = true;
      if (m.pendingId !== undefined) pendingPorts.delete(m.pendingId);
      if (m.portId !== undefined) ports.delete(m.portId);
      // Surface as lastError on the next chrome.* call (port has no
      // direct lastError surface). For now, just disconnect.
      port.onDisconnect._dispatch([]);
      return;
    }
    case 'port-incoming': {
      // Host is forwarding a port from an inbound runtime.connect to
      // this window. Construct a local Port, fire onConnect on every
      // chrome instance for this extension.
      const port = new Port(m.name ?? '');
      port.portId = m.portId;
      ports.set(m.portId, port);
      const set = instances.get(m.extId);
      if (!set) return;
      for (const inst of set) {
        inst.runtime.onConnect._dispatch([port]);
      }
      return;
    }
  }
});
