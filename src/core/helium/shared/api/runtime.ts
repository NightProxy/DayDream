import type { ExtensionContext } from '../../extfs/types';
import type { ChromeManifest, FirefoxManifest } from '../unpack/types';
import { ChromeEvent } from '../ChromeEvent';

/**
 * `chrome.runtime` stub (overridden at runtime by `installRpcBindings`
 * once the iframe finishes its host handshake).
 *
 * IMPORTANT — pre-handshake call safety:
 *
 * Extensions routinely call `chrome.runtime.setUninstallURL`,
 * `getPlatformInfo`, etc. at TOP LEVEL of their BG script — i.e.
 * before the host's `__helium_handshake_receive__` runs and
 * `installRpcBindings` overlays these methods with real RPC-aware
 * implementations. If those pre-handshake calls THROW, the extension's
 * init never completes (Privacy Badger crashes here today, for one).
 *
 * So: methods whose Chrome contract returns void / Promise<void> /
 * an empty-ish payload (and that real extensions call fire-and-forget)
 * are NO-OPS in the stub. Methods that genuinely need a host round-trip
 * (sendMessage, connect, requestUpdateCheck, ...) still throw at the
 * stub level — but those are also listed in RPC_BINDINGS, so they get
 * overlaid after handshake and the throw never reaches user code
 * UNLESS the extension calls them before handshake, in which case
 * throwing is the honest answer.
 *
 * The classification follows Chrome's official return-type contract.
 */
export class ChromeRuntimeBase {
  protected readonly ctx: ExtensionContext;
  public readonly id: string;
  public readonly dynamicId: string;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.id = ctx.id;
    this.dynamicId = crypto.randomUUID();
  }

  public readonly onRestartRequired: ChromeEvent = new ChromeEvent();
  public readonly onMessageExternal: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();
  public readonly onConnectNative: ChromeEvent = new ChromeEvent();
  public readonly onConnectExternal: ChromeEvent = new ChromeEvent();
  public readonly onConnect: ChromeEvent = new ChromeEvent();
  public readonly onBrowserUpdateAvailable: ChromeEvent = new ChromeEvent();
  public readonly onUpdateAvailable: ChromeEvent = new ChromeEvent();
  public readonly onSuspendCanceled: ChromeEvent = new ChromeEvent();
  public readonly onSuspend: ChromeEvent = new ChromeEvent();
  public readonly onInstalled: ChromeEvent = new ChromeEvent();
  public readonly onStartup: ChromeEvent = new ChromeEvent();

  /**
   * BG-initiated `chrome.runtime.connect`. Opens a Port to another
   * extension (or self when extensionId omitted).
   *
   * NOTE: this stub is overlaid post-handshake — see
   * `bootstrap/client.ts:installRuntimeConnect`. The dead-port
   * return below is the pre-handshake fallback for the rare case
   * where an extension calls connect at top-level of its BG script
   * before the handshake completes.
   */
  connect(...args: any[]): any {
    const name = (() => {
      const last = args[args.length - 1];
      if (last && typeof last === 'object' && 'name' in last) {
        return String((last as { name?: unknown }).name ?? '');
      }
      return '';
    })();
    return makeDeadPort(name);
  }
  connectNative(..._args: any[]): any {
    throw new Error('chrome.runtime.connectNative is not implemented');
  }
  sendMessage(..._args: any[]): any {
    throw new Error('chrome.runtime.sendMessage is not implemented');
  }

  getManifest(): ChromeManifest | FirefoxManifest {
    return this.ctx.manifest;
  }
  getURL(path: string): string {
    const rel = path.replace(/^\/+/, '');
    return `https://${this.ctx.origin}/${rel}`;
  }

  getPlatformInfo(...args: any[]): any {
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
    let os: string = 'linux';
    if (/Windows/.test(ua)) os = 'win';
    else if (/Mac/.test(ua)) os = 'mac';
    else if (/Linux/.test(ua)) os = 'linux';
    else if (/CrOS/.test(ua)) os = 'cros';
    else if (/Android/.test(ua)) os = 'android';
    const info = { os, arch: 'x86-64', nacl_arch: 'x86-64' };
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(info); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(info);
  }
  requestUpdateCheck(...args: any[]): any {
    const result = { status: 'no_update' };
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(result); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(result);
  }
  sendNativeMessage(...args: any[]): any {
    const cb = typeof args[2] === 'function' ? args[2] : null;
    if (cb) { try { cb(undefined); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(undefined);
  }

  openOptionsPage(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }
  reload(..._args: any[]): any {
    return undefined;
  }
  setUninstallURL(...args: any[]): any {
    const cb = typeof args[1] === 'function' ? args[1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  restart(..._args: any[]): undefined {
    return undefined;
  }
  restartAfterDelay(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }

  static readonly ContextType = {
    BACKGROUND: "BACKGROUND",
    DEVELOPER_TOOLS: "DEVELOPER_TOOLS",
    OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT",
    POPUP: "POPUP",
    SIDE_PANEL: "SIDE_PANEL",
    TAB: "TAB",
  } as const;

  static readonly OnInstalledReason = {
    CHROME_UPDATE: "chrome_update",
    INSTALL: "install",
    SHARED_MODULE_UPDATE: "shared_module_update",
    UPDATE: "update",
  } as const;

  static readonly OnRestartRequiredReason = {
    APP_UPDATE: "app_update",
    OS_UPDATE: "os_update",
    PERIODIC: "periodic",
  } as const;

  static readonly PlatformArch = {
    ARM: "arm",
    ARM64: "arm64",
    MIPS: "mips",
    MIPS64: "mips64",
    RISCV64: "riscv64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformNaclArch = {
    ARM: "arm",
    MIPS: "mips",
    MIPS64: "mips64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformOs = {
    ANDROID: "android",
    CROS: "cros",
    LINUX: "linux",
    MAC: "mac",
    OPENBSD: "openbsd",
    WIN: "win",
  } as const;

  static readonly RequestUpdateCheckStatus = {
    NO_UPDATE: "no_update",
    THROTTLED: "throttled",
    UPDATE_AVAILABLE: "update_available",
  } as const;
}

/**
 * Construct a stub Port object whose `onDisconnect` listeners fire
 * on the next microtask. Used as a placeholder return value for
 * unwired chrome.*.connect surfaces (chrome.runtime.connect from
 * BG, chrome.tabs.connect, chrome.extension.connect MV2). Better
 * than throwing because:
 *   - extensions that listen for onDisconnect handle it gracefully
 *   - extensions that defensively branch on `port` truthiness
 *     still proceed (the port object exists, just dies fast)
 *
 * The shape matches chrome.runtime.Port enough that defensive code
 * paths see a real-looking object: `name`, `sender`, `onMessage`,
 * `onDisconnect`, `postMessage(noop)`, `disconnect(noop)`.
 */
function makeDeadPort(name: string): {
  name: string;
  sender: undefined;
  onMessage: { addListener(): void; removeListener(): void; hasListener(): boolean };
  onDisconnect: { addListener(fn: (port: unknown) => void): void; removeListener(): void; hasListener(): boolean };
  postMessage: (msg: unknown) => void;
  disconnect: () => void;
} {
  const disconnectListeners: Array<(port: unknown) => void> = [];
  const port = {
    name,
    sender: undefined,
    onMessage: {
      addListener: (): void => { /* never fires */ },
      removeListener: (): void => { /* no-op */ },
      hasListener: (): boolean => false,
    },
    onDisconnect: {
      addListener: (fn: (port: unknown) => void): void => {
        disconnectListeners.push(fn);
      },
      removeListener: (): void => { /* no-op */ },
      hasListener: (): boolean => disconnectListeners.length > 0,
    },
    postMessage: (_msg: unknown): void => { /* dropped */ },
    disconnect: (): void => { /* already dead */ },
  };
  queueMicrotask(() => {
    for (const fn of disconnectListeners) {
      try { fn(port); } catch (err) {
        console.warn('[helium/runtime.connect] onDisconnect listener threw:', err);
      }
    }
  });
  return port;
}
