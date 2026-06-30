/**
 * Host-side relay for content-script RPC + event fanout.
 *
 * Listens on the host's window for:
 *   - rpc-req         : page → host async chrome.* call
 *   - window-ready    : per-script registration (per-window tracker)
 *   - window-gone     : best-effort cleanup on pagehide
 *   - port-connect    : opens a Port; host assigns portId; opens BG end
 *   - port-msg        : routes port message between BG and CS
 *   - port-close      : closes a port on caller's side
 *
 * Posts back to source windows:
 *   - rpc-resp        : reply to rpc-req
 *   - event           : fanout from BG (storage.onChanged, runtime.onMessage)
 *   - port-opened     : ack on port-connect (CS-initiated)
 *   - port-incoming   : BG-initiated port (host → CS) — CS mints local Port
 *   - port-msg        : forward from BG to CS port
 *   - port-close      : CS observes port disconnected from BG side
 *   - port-error      : port-connect failed (target down, perm denied, etc.)
 */

import type { ExtensionContext, ExtensionIndexEntry } from '../extfs/types';

export interface SpawnedRef {
  ctx: ExtensionContext;
  entry: ExtensionIndexEntry;
  channel: { sendEvent(method: string, args: unknown[]): void };
}

export interface RelayDeps {
  getSpawnedContext: (extId: string) => SpawnedRef | undefined;
  runChromeHandler: (ctx: ExtensionContext, method: string, args: unknown[]) => Promise<unknown>;
}

interface WindowEntry {
  windowRef: WeakRef<Window>;
  scriptKeys: Set<string>;
}

const SWEEP_INTERVAL_MS = 30_000;

export class ContentScriptRelay {
  private deps: RelayDeps;
  private installed = false;
  private listener: ((e: MessageEvent) => void) | null = null;
  private sweepTimer: number | null = null;

  public readonly tracked = new Map<string, Map<string, WindowEntry>>();

  public portHandler: ((data: any, source: Window) => void) | null = null;

  constructor(deps: RelayDeps) {
    this.deps = deps;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.listener = (e) => { void this.onMessage(e); };
    window.addEventListener('message', this.listener);
    this.sweepTimer = window.setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  uninstall(): void {
    if (!this.installed) return;
    this.installed = false;
    if (this.listener) window.removeEventListener('message', this.listener);
    this.listener = null;
    if (this.sweepTimer !== null) window.clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.tracked.clear();
  }

  private async onMessage(e: MessageEvent): Promise<void> {
    const raw = e.data as any;
    if (!raw || typeof raw !== 'object') return;
    const m = raw.__helium_cs__
      ? raw
      : (raw.$scramjet$messagetype && raw.$scramjet$data?.__helium_cs__)
        ? raw.$scramjet$data
        : null;
    if (!m) return;

    const source = e.source as Window | null;
    if (!source) return;
    if (source === window) return;

    switch (m.__helium_cs__) {
      case 'rpc-req':
        await this.handleRpc(m, source);
        return;
      case 'window-ready':
        this.trackWindow(m.extId, m.windowToken, source, m.scriptKey);
        return;
      case 'window-gone':
        this.untrackWindow(m.extId, m.windowToken);
        return;
      case 'port-connect':
      case 'port-msg':
      case 'port-close':
        if (this.portHandler) this.portHandler(m, source);
        return;
    }
  }

  private async handleRpc(m: any, source: Window): Promise<void> {
    const { extId, method, args, reqId } = m;
    if (typeof extId !== 'string' || typeof method !== 'string' || typeof reqId !== 'number') {
      return;
    }
    const spawned = this.deps.getSpawnedContext(extId);
    if (!spawned) {
      this.sendReply(source, reqId, {
        error: { message: `Extension ${extId} is not running`, name: 'Error' },
      });
      return;
    }
    try {
      const result = await this.deps.runChromeHandler(spawned.ctx, method, args ?? []);
      this.sendReply(source, reqId, { result });
    } catch (err) {
      const e = err as Error;
      this.sendReply(source, reqId, {
        error: { message: e.message, name: e.name },
      });
    }
  }

  private sendReply(source: Window, reqId: number, payload: { result?: unknown; error?: { message: string; name?: string } }): void {
    try {
      source.postMessage({ __helium_cs__: 'rpc-resp', reqId, ...payload }, '*');
    } catch (err) {
      console.warn('[helium/content/relay] reply post failed:', err);
    }
  }

  private trackWindow(extId: string, token: string, source: Window, scriptKey: string): void {
    let inner = this.tracked.get(extId);
    if (!inner) {
      inner = new Map();
      this.tracked.set(extId, inner);
    }
    const existing = inner.get(token);
    if (existing) {
      existing.scriptKeys.add(scriptKey);
    } else {
      inner.set(token, {
        windowRef: new WeakRef(source),
        scriptKeys: new Set([scriptKey]),
      });
    }
  }

  private untrackWindow(extId: string, token: string): void {
    const inner = this.tracked.get(extId);
    if (!inner) return;
    inner.delete(token);
    if (inner.size === 0) this.tracked.delete(extId);
  }

  private sweep(): void {
    for (const [extId, inner] of this.tracked) {
      for (const [token, entry] of inner) {
        if (!entry.windowRef.deref()) inner.delete(token);
      }
      if (inner.size === 0) this.tracked.delete(extId);
    }
  }

  /** Broadcast an event from BG to every page with this extension's content scripts. */
  fanoutToContentScripts(extId: string, method: string, args: unknown[]): void {
    const inner = this.tracked.get(extId);
    if (!inner) return;
    const sentWindows = new WeakSet<Window>();
    for (const [token, entry] of inner) {
      const win = entry.windowRef.deref();
      if (!win) {
        inner.delete(token);
        continue;
      }
      if (sentWindows.has(win)) continue;
      sentWindows.add(win);
      try {
        win.postMessage({ __helium_cs__: 'event', extId, method, args }, '*');
      } catch (err) {
        console.warn(`[helium/content/relay] fanout failed for ${token}:`, err);
        inner.delete(token);
      }
    }
    if (inner.size === 0) this.tracked.delete(extId);
  }

  /**
   * Look up every window that has at least one content script for the
   * given extension. Used by chrome.scripting.executeScript to find
   * a target tab's window.
   */
  windowsForExt(extId: string): Window[] {
    const inner = this.tracked.get(extId);
    if (!inner) return [];
    const out: Window[] = [];
    for (const entry of inner.values()) {
      const win = entry.windowRef.deref();
      if (win) out.push(win);
    }
    return out;
  }
}
