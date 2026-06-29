/**
 * Host-side Port routing. Attaches to a ContentScriptRelay's
 * portHandler. Manages port lifecycle: connect/msg/close/error +
 * cleanup on extension disable.
 */

import type { ContentScriptRelay, SpawnedRef } from './relay';

interface HostPort {
  portId: number;
  ownerExtId: string;
  ownerWindow: Window;
  ownerScriptKey: string;
  targetExtId: string;
  targetSpawned: SpawnedRef;
  closed: boolean;
}

const MAX_PORTS_PER_EXT = 1024;

export class PortRouter {
  private nextPortId = 1;
  private ports = new Map<number, HostPort>();
  private perExtPortCount = new Map<string, number>();
  private getSpawned: (extId: string) => SpawnedRef | undefined;

  constructor(relay: ContentScriptRelay, getSpawned: (extId: string) => SpawnedRef | undefined) {
    this.getSpawned = getSpawned;
    relay.portHandler = (data, source) => this.onPortMessage(data, source);
  }

  private incExt(extId: string): number {
    const n = (this.perExtPortCount.get(extId) ?? 0) + 1;
    this.perExtPortCount.set(extId, n);
    return n;
  }

  private decExt(extId: string): void {
    const n = (this.perExtPortCount.get(extId) ?? 0) - 1;
    if (n <= 0) this.perExtPortCount.delete(extId);
    else this.perExtPortCount.set(extId, n);
  }

  private onPortMessage(data: any, source: Window): void {
    switch (data.__helium_cs__) {
      case 'port-connect':
        this.handleConnect(data, source);
        return;
      case 'port-msg':
        this.handleMsg(data, source);
        return;
      case 'port-close':
        this.handleClose(data);
        return;
    }
  }

  private handleConnect(data: any, source: Window): void {
    const ownerExtId: string = data.ownerExtId;
    const targetExtId: string = data.targetExtId ?? ownerExtId;
    const name: string = data.name ?? '';
    const pendingId: number = data.pendingId;
    const scriptKey: string = data.scriptKey;

    if (this.incExt(ownerExtId) > MAX_PORTS_PER_EXT) {
      this.decExt(ownerExtId);
      this.postError(source, pendingId, 'Port limit exceeded');
      return;
    }

    const targetSpawned = this.getSpawned(targetExtId);
    if (!targetSpawned) {
      this.decExt(ownerExtId);
      this.postError(source, pendingId, 'Receiver not running');
      return;
    }

    // Cross-extension perm check
    if (ownerExtId !== targetExtId) {
      const ec = (targetSpawned.ctx.manifest as any).externally_connectable;
      const ids = ec?.ids;
      if (!Array.isArray(ids) || (!ids.includes('*') && !ids.includes(ownerExtId))) {
        this.decExt(ownerExtId);
        this.postError(source, pendingId, 'Not externally_connectable');
        return;
      }
    }

    const portId = this.nextPortId++;
    const port: HostPort = {
      portId, ownerExtId, ownerWindow: source, ownerScriptKey: scriptKey,
      targetExtId, targetSpawned, closed: false,
    };
    this.ports.set(portId, port);

    // Tell BG about the new port
    targetSpawned.channel.sendEvent('chrome.runtime.onConnect-port', [{
      portId, name, sender: { id: ownerExtId },
    }]);

    // Ack CS
    try {
      source.postMessage({ __helium_cs__: 'port-opened', pendingId, portId }, '*');
    } catch { /* ignore */ }
  }

  private handleMsg(data: any, source: Window): void {
    const port = this.ports.get(data.portId);
    if (!port || port.closed) return;
    // Determine direction
    if (source === port.ownerWindow) {
      // CS → BG
      port.targetSpawned.channel.sendEvent('chrome.runtime.port-msg', [{
        portId: port.portId, message: data.message,
      }]);
    }
    // BG → CS happens via a separate path: BG channel handler dispatches
    // a port-msg event that ExtensionManager forwards to relay → CS.
    // (Wired in Task 21.)
  }

  private handleClose(data: any): void {
    this.closePort(data.portId, 'caller');
  }

  closePort(portId: number, _reason: string): void {
    const port = this.ports.get(portId);
    if (!port || port.closed) return;
    port.closed = true;
    this.ports.delete(portId);
    this.decExt(port.ownerExtId);

    // Notify counterpart
    try {
      port.ownerWindow.postMessage({ __helium_cs__: 'port-close', portId }, '*');
    } catch { /* ignore */ }
    try {
      port.targetSpawned.channel.sendEvent('chrome.runtime.port-close', [{ portId }]);
    } catch { /* ignore */ }
  }

  closeAllPortsForExt(extId: string): void {
    for (const [portId, port] of this.ports) {
      if (port.ownerExtId === extId || port.targetExtId === extId) {
        this.closePort(portId, 'extension-stopped');
      }
    }
  }

  /** Forward a BG-originated port message to the CS window. */
  forwardBgToCs(portId: number, message: unknown): void {
    const port = this.ports.get(portId);
    if (!port || port.closed) return;
    try {
      port.ownerWindow.postMessage({ __helium_cs__: 'port-msg', portId, message }, '*');
    } catch { /* ignore */ }
  }

  /**
   * BG-initiated `chrome.tabs.connect(tabId, {name, frameId?})` →
   * open a port from BG to a content script in `tabId`. Returns the
   * portId on success or `-1` on failure.
   *
   * Symmetric to handleConnect but reversed: BG is the initiator,
   * CS is the receiver. We post a `port-incoming` message into the
   * target CS's window — mini-chrome-instance.ts:417 handles it,
   * mints a CS-side Port, and fires `chrome.runtime.onConnect`.
   *
   * The CS handler expects `{__helium_cs__:'port-incoming', extId,
   * portId, name}` — `extId` is the content-script's mini-chrome
   * instance key (registered at script-injection time), which is the
   * extension's id. For BG-initiated tabs.connect from extension X
   * targeting a tab where X has a content script, that's `extId = X`.
   */
  bgInitiatedConnectTab(
    initiatorExtId: string,
    initiatorChannel: { sendEvent: (m: string, a: unknown[]) => void },
    tabId: number,
    name: string,
    frameId: number | undefined,
    targetIframe: HTMLIFrameElement,
  ): number {
    if (this.incExt(initiatorExtId) > MAX_PORTS_PER_EXT) {
      this.decExt(initiatorExtId);
      return -1;
    }
    const targetWin = targetIframe.contentWindow;
    if (!targetWin) {
      this.decExt(initiatorExtId);
      return -1;
    }
    const portId = this.nextPortId++;
    // Synthesize a HostPort entry. ownerWindow = target CS window
    // (where the port lives); "BG-→CS" port-msg events from the BG
    // side will be forwarded via forwardBgToCs to this window.
    const port: HostPort = {
      portId,
      ownerExtId: initiatorExtId,
      ownerWindow: targetWin,
      ownerScriptKey: 'bg-initiated',
      targetExtId: initiatorExtId,
      // Synthesize a SpawnedRef-shaped object pointing back at the
      // initiator's channel so CS-→BG port-msg works.
      targetSpawned: { ctx: { id: initiatorExtId } as unknown as SpawnedRef['ctx'], entry: {} as SpawnedRef['entry'], channel: initiatorChannel as unknown as SpawnedRef['channel'] },
      closed: false,
    };
    this.ports.set(portId, port);
    void frameId; // frameId-specific routing TBD; for now broadcasts
                  // to the top frame.
    try {
      // `port-incoming` matches the existing CS-side handler at
      // mini-chrome-instance.ts:417 which constructs a CS-side Port
      // and dispatches `chrome.runtime.onConnect`. The `extId` keys
      // into the per-window instances map (BG-initiated ports target
      // the initiator's own content-script instance).
      targetWin.postMessage({
        __helium_cs__: 'port-incoming',
        extId: initiatorExtId,
        portId,
        name,
        sender: { id: initiatorExtId, tab: { id: tabId } },
      }, '*');
    } catch (err) {
      console.warn('[port] bgInitiatedConnectTab: postMessage failed', err);
      this.ports.delete(portId);
      this.decExt(initiatorExtId);
      return -1;
    }
    return portId;
  }

  /**
   * BG-initiated `chrome.runtime.connect(targetExtId?, {name})` —
   * open a port from this extension's BG to another running
   * extension's BG (or to itself's other contexts — popup/options/
   * offscreen — which all share the same `targetSpawned.channel`).
   *
   * For cross-extension: `externally_connectable.ids` on the target
   * must include the initiator. The target's `chrome.runtime.onConnectExternal`
   * is fired with a port whose `sender.id` is the initiator's id.
   *
   * Symmetric to handleConnect but the receiver is a BG (not a CS).
   * The receiving side gets the port via `chrome.runtime.onConnect-port`
   * event (same path used by CS-initiated connect at handleConnect:97).
   */
  bgInitiatedConnectRuntime(
    initiatorExtId: string,
    targetExtId: string,
    name: string,
  ): number {
    if (this.incExt(initiatorExtId) > MAX_PORTS_PER_EXT) {
      this.decExt(initiatorExtId);
      return -1;
    }
    const targetSpawned = this.getSpawned(targetExtId);
    if (!targetSpawned) {
      this.decExt(initiatorExtId);
      return -1;
    }
    // Cross-extension permission gate (same logic as handleConnect:79-87)
    if (initiatorExtId !== targetExtId) {
      const ec = (targetSpawned.ctx.manifest as { externally_connectable?: { ids?: string[] } }).externally_connectable;
      const ids = ec?.ids;
      if (!Array.isArray(ids) || (!ids.includes('*') && !ids.includes(initiatorExtId))) {
        this.decExt(initiatorExtId);
        return -1;
      }
    }
    const portId = this.nextPortId++;
    // For BG-→BG, the "ownerWindow" concept doesn't apply (BG isn't a
    // regular window we postMessage to). Both sides route via
    // channel.sendEvent. We set ownerWindow to the host window as a
    // non-null placeholder; forwardBgToCs is never called for these
    // (BG messages flow through `chrome.runtime.port-msg` events on
    // each side's channel, not window.postMessage).
    const port: HostPort = {
      portId,
      ownerExtId: initiatorExtId,
      ownerWindow: window,
      ownerScriptKey: 'bg-initiated-runtime',
      targetExtId,
      targetSpawned,
      closed: false,
    };
    this.ports.set(portId, port);
    try {
      targetSpawned.channel.sendEvent('chrome.runtime.onConnect-port', [{
        portId,
        name,
        sender: { id: initiatorExtId },
        external: initiatorExtId !== targetExtId,
      }]);
    } catch (err) {
      console.warn('[port] bgInitiatedConnectRuntime: sendEvent failed', err);
      this.ports.delete(portId);
      this.decExt(initiatorExtId);
      return -1;
    }
    return portId;
  }

  private postError(source: Window, pendingId: number, error: string): void {
    try {
      source.postMessage({ __helium_cs__: 'port-error', pendingId, error }, '*');
    } catch { /* ignore */ }
  }
}
