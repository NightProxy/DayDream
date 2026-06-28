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

  private postError(source: Window, pendingId: number, error: string): void {
    try {
      source.postMessage({ __helium_cs__: 'port-error', pendingId, error }, '*');
    } catch { /* ignore */ }
  }
}
