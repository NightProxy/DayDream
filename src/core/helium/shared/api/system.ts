import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

/**
 * `chrome.system.*` — host-environment introspection.
 *
 * All getInfo methods synthesize from `navigator.*` / `screen.*` so
 * extensions that branch on hardware info don't crash. The synthesized
 * values are realistic best-effort:
 *
 *   - `cpu.getInfo`        → `{numOfProcessors, archName, modelName, features, processors}`
 *                            from `navigator.hardwareConcurrency` etc.
 *   - `memory.getInfo`     → `{capacity, availableCapacity}` from
 *                            `navigator.deviceMemory * 1GB`. We can't
 *                            measure free memory in JS so capacity ≈ available.
 *   - `display.getInfo`    → one `DisplayUnitInfo` per `screen` /
 *                            `window.screen`. Synthesized as the primary
 *                            display matching `screen.*` properties.
 *   - `storage.getInfo`    → `[]`. OPFS doesn't expose attached USB
 *                            sticks etc., and that's the only thing
 *                            Chrome's system.storage really cares about.
 *
 * Mutating methods (touch calibration, mirror mode, etc.) are all
 * no-ops — DDX is not ChromeOS, these have no analog.
 */

function navHardwareConcurrency(): number {
  try { return typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 4; }
  catch { return 4; }
}

function navDeviceMemoryGB(): number {
  try {
    const n = (navigator as { deviceMemory?: number }).deviceMemory;
    return typeof n === 'number' ? n : 8;
  } catch { return 8; }
}

function navUserAgentArch(): string {
  try {
    const ua = navigator.userAgent || '';
    if (/x86_64|x64|Win64|WOW64/i.test(ua)) return 'x86-64';
    if (/i686|i386|x86/i.test(ua)) return 'x86-32';
    if (/aarch64|arm64/i.test(ua)) return 'arm64';
    if (/armv7|armv8|arm/i.test(ua)) return 'arm';
  } catch { /* noop */ }
  return 'x86-64';
}

class ChromeSystemCpu {
  getInfo(...args: any[]): any {
    const n = navHardwareConcurrency();
    const info = {
      numOfProcessors: n,
      archName: navUserAgentArch(),
      modelName: 'unknown',
      features: [] as string[],
      processors: Array.from({ length: n }, () => ({
        usage: { user: 0, kernel: 0, idle: 0, total: 0 },
      })),
      temperatures: [] as number[],
    };
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(info); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(info);
  }
}

class ChromeSystemDisplay {
  public readonly onDisplayChanged: ChromeEvent = new ChromeEvent();

  private synthesizeDisplay(): unknown {
    let w = 1920, h = 1080, dpr = 1;
    try { w = window.screen.width; h = window.screen.height; dpr = window.devicePixelRatio; } catch { /* noop */ }
    return {
      id: 'primary',
      name: 'Primary Display',
      mirroringSourceId: '',
      isPrimary: true,
      isInternal: true,
      isEnabled: true,
      dpiX: 96 * dpr,
      dpiY: 96 * dpr,
      rotation: 0,
      bounds: { left: 0, top: 0, width: w, height: h },
      overscan: { left: 0, top: 0, right: 0, bottom: 0 },
      workArea: { left: 0, top: 0, width: w, height: h },
      displayZoomFactor: dpr,
      hasTouchSupport: false,
      hasAccelerometerSupport: false,
      activeState: 'active',
    };
  }

  getInfo(...args: any[]): any {
    const list = [this.synthesizeDisplay()];
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(list); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(list);
  }

  getDisplayLayout(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  clearTouchCalibration(): void { /* no-op */ }
  completeCustomTouchCalibration(): void { /* no-op */ }
  enableUnifiedDesktop(): void { /* no-op */ }
  overscanCalibrationAdjust(): void { /* no-op */ }
  overscanCalibrationComplete(): void { /* no-op */ }
  overscanCalibrationReset(): void { /* no-op */ }
  overscanCalibrationStart(): void { /* no-op */ }
  setDisplayLayout(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }
  setDisplayProperties(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }
  setMirrorMode(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(); } catch { /* swallow */ } return undefined; }
    return Promise.resolve();
  }
  showNativeTouchCalibration(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(false); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(false);
  }
  startCustomTouchCalibration(): void { /* no-op */ }

  static readonly ActiveState = {
    ACTIVE: "active",
    INACTIVE: "inactive",
  } as const;

  static readonly LayoutPosition = {
    BOTTOM: "bottom",
    LEFT: "left",
    RIGHT: "right",
    TOP: "top",
  } as const;

  static readonly MirrorMode = {
    MIXED: "mixed",
    NORMAL: "normal",
    OFF: "off",
  } as const;
}

class ChromeSystemMemory {
  getInfo(...args: any[]): any {
    const bytes = navDeviceMemoryGB() * 1024 * 1024 * 1024;
    const info = { capacity: bytes, availableCapacity: bytes };
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(info); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(info);
  }
}

export class ChromeSystemStorageBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onDetached: ChromeEvent = new ChromeEvent();
  public readonly onAttached: ChromeEvent = new ChromeEvent();

  ejectDevice(...args: any[]): any {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb('no_such_device'); } catch { /* swallow */ } return undefined; }
    return Promise.resolve('no_such_device');
  }

  getInfo(...args: any[]): any {
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  static readonly EjectDeviceResultCode = {
    FAILURE: "failure",
    IN_USE: "in_use",
    NO_SUCH_DEVICE: "no_such_device",
    SUCCESS: "success",
  } as const;

  static readonly StorageUnitType = {
    FIXED: "fixed",
    REMOVABLE: "removable",
    UNKNOWN: "unknown",
  } as const;
}

export class ChromeSystemBase {
  protected readonly ctx: ExtensionContext;

  public readonly cpu: ChromeSystemCpu = new ChromeSystemCpu();
  public readonly display: ChromeSystemDisplay = new ChromeSystemDisplay();
  public readonly memory: ChromeSystemMemory = new ChromeSystemMemory();
  public storage: ChromeSystemStorageBase;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.storage = new ChromeSystemStorageBase(ctx);
  }
}
