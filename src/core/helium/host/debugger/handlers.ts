// src/core/helium/host/debugger/index.ts
//
// chrome.debugger session management. Each `debugger.attach({tabId})`
// creates an isolated DebuggerSession owning:
//   - The target identity (tabId)
//   - A subscription on the host CdpHelper for that tab's events
//   - Detach + onDetach + onEvent dispatch
//
// Sessions are keyed by (extensionId, tabId). One extension can hold
// at most one active session per tab (matches Chrome's contract:
// re-attaching to an already-attached tab from the same extension
// throws). Cross-extension contention behaves like Chrome's
// "[extName] takes over debugger" — first attach wins, subsequent
// attaches from different extensions fail. We track the "winning"
// extension per tab in a small `debuggees` map.
//
// CDP event fan-out:
//   The nyxBridge CdpHelper drops unpaired CDP events today. We hook
//   into its `handleAgentMessage` path by registering as an
//   `onCdpEvent` observer (added in the same patch). When an event
//   arrives for a tab that has an active session, we dispatch
//   `chrome.debugger.onEvent` on that session's extension with
//   `(source, method, params)`.

import type { CdpHelper } from '@apis/nyxBridge/cdp';

export interface DebuggerSession {
  extId: string;
  tabId: number;
  attached: boolean;
}

/**
 * Manages chrome.debugger sessions across all running extensions.
 * Single instance owned by ExtensionManager; constructed alongside
 * the other host handler bundles.
 *
 * Lifecycle:
 *   - attach(extId, target, requiredVersion?) →
 *       throws if target.tabId already has an active session.
 *       Otherwise records session + returns void.
 *   - detach(extId, target) → tears down session; fires onDetach
 *       with `target_closed` if the tab was the holder.
 *   - sendCommand(extId, target, method, params) →
 *       requires an active session for (extId, tabId). Delegates to
 *       CdpHelper.send.
 *   - getTargets(extId) → all tabs (always "attached: true" because
 *       DDX has no concept of dormant CDP targets — every tab has
 *       an agent eagerly installed by hookInstaller).
 *   - onCdpEvent(tabId, method, params) → called by the patched
 *       CdpHelper when an event arrives; we forward as
 *       chrome.debugger.onEvent.
 *
 * Wire-up: ExtensionManager constructs this with a CdpHelper
 * reference + a `fanout(extId, eventName, args)` callback so we
 * can fire events without circular imports.
 */
export class DebuggerHandlers {
  private cdp: CdpHelper;
  private fanoutToExt: (extId: string, eventName: string, args: unknown[]) => void;
  /** (extId, tabId) → session. */
  private sessions = new Map<string, DebuggerSession>();
  /** tabId → extId that currently holds the session (first-wins). */
  private debuggees = new Map<number, string>();

  constructor(opts: {
    cdp: CdpHelper;
    fanoutToExt: (extId: string, eventName: string, args: unknown[]) => void;
  }) {
    this.cdp = opts.cdp;
    this.fanoutToExt = opts.fanoutToExt;
  }

  private key(extId: string, tabId: number): string {
    return `${extId}|${tabId}`;
  }

  attach(extId: string, target: { tabId?: number }, requiredVersion?: string): void {
    void requiredVersion; // Chrome wants ≥1.3 — we always satisfy it.
    if (typeof target?.tabId !== 'number') {
      throw new Error('chrome.debugger.attach: target.tabId is required');
    }
    const tabId = target.tabId;
    const existing = this.debuggees.get(tabId);
    if (existing) {
      if (existing === extId) {
        throw new Error(
          `chrome.debugger.attach: already attached to tab ${tabId}`,
        );
      }
      throw new Error(
        `chrome.debugger.attach: another debugger is already attached to tab ${tabId}`,
      );
    }
    this.sessions.set(this.key(extId, tabId), { extId, tabId, attached: true });
    this.debuggees.set(tabId, extId);
  }

  detach(extId: string, target: { tabId?: number }): void {
    if (typeof target?.tabId !== 'number') {
      throw new Error('chrome.debugger.detach: target.tabId is required');
    }
    const tabId = target.tabId;
    const k = this.key(extId, tabId);
    const session = this.sessions.get(k);
    if (!session) {
      throw new Error(`chrome.debugger.detach: not attached to tab ${tabId}`);
    }
    this.sessions.delete(k);
    if (this.debuggees.get(tabId) === extId) {
      this.debuggees.delete(tabId);
    }
  }

  async sendCommand(
    extId: string,
    target: { tabId?: number },
    method: string,
    params: object = {},
  ): Promise<unknown> {
    if (typeof target?.tabId !== 'number') {
      throw new Error('chrome.debugger.sendCommand: target.tabId is required');
    }
    const k = this.key(extId, target.tabId);
    const session = this.sessions.get(k);
    if (!session) {
      throw new Error(
        `chrome.debugger.sendCommand: not attached to tab ${target.tabId}`,
      );
    }
    if (typeof method !== 'string' || !method) {
      throw new Error('chrome.debugger.sendCommand: method is required');
    }
    return this.cdp.send(target.tabId, method, params);
  }

  /**
   * Called by the patched CdpHelper whenever an unpaired CDP event
   * arrives for a tab. We forward to whichever extension currently
   * has the session (if any).
   *
   * Chrome's `onEvent` listener signature:
   *   (source: Debuggee, method: string, params?: object) => void
   */
  onCdpEvent(tabId: number, method: string, params: unknown): void {
    const extId = this.debuggees.get(tabId);
    if (!extId) return;
    const source = { tabId };
    this.fanoutToExt(extId, 'chrome.debugger.onEvent', [source, method, params]);
  }

  /**
   * Notify when a tab closes — fire onDetach for any holding
   * extension with reason 'target_closed' and tear down state.
   * Wired from the tabClosed listener in extensions.ts.
   */
  onTabClosed(tabId: number): void {
    const extId = this.debuggees.get(tabId);
    if (!extId) return;
    const source = { tabId };
    this.fanoutToExt(extId, 'chrome.debugger.onDetach', [source, 'target_closed']);
    this.sessions.delete(this.key(extId, tabId));
    this.debuggees.delete(tabId);
  }

  /**
   * Enumerate available targets — every DDX tab. We don't track
   * 'attached' state per-tab in the session map (the manager does);
   * each entry reports whether it's currently attached *by any
   * extension*.
   */
  getTargets(opts: {
    listTabs: () => Array<{ tabId: number; title: string; url: string }>;
  }): Array<{
    targetId: string;
    type: string;
    title: string;
    url: string;
    attached: boolean;
    tabId: number;
  }> {
    return opts.listTabs().map((t) => ({
      targetId: `tab-${t.tabId}`,
      type: 'page',
      title: t.title || '',
      url: t.url || '',
      attached: this.debuggees.has(t.tabId),
      tabId: t.tabId,
    }));
  }

  /** Tear down ALL sessions for an extension (called on uninstall/disable). */
  clearForExt(extId: string): void {
    for (const [k, session] of this.sessions) {
      if (session.extId === extId) {
        this.sessions.delete(k);
        if (this.debuggees.get(session.tabId) === extId) {
          this.debuggees.delete(session.tabId);
        }
      }
    }
  }
}
