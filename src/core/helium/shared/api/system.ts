import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

class ChromeSystemCpu {
  getInfo(..._args: any[]): any {
    throw new Error('chrome.system.cpu.getInfo is not implemented');
  }
}

class ChromeSystemDisplay {
  public readonly onDisplayChanged: ChromeEvent = new ChromeEvent();

  clearTouchCalibration(..._args: any[]): any {
    throw new Error('chrome.system.display.clearTouchCalibration is not implemented');
  }
  completeCustomTouchCalibration(..._args: any[]): any {
    throw new Error('chrome.system.display.completeCustomTouchCalibration is not implemented');
  }
  enableUnifiedDesktop(..._args: any[]): any {
    throw new Error('chrome.system.display.enableUnifiedDesktop is not implemented');
  }
  getDisplayLayout(..._args: any[]): any {
    throw new Error('chrome.system.display.getDisplayLayout is not implemented');
  }
  getInfo(..._args: any[]): any {
    throw new Error('chrome.system.display.getInfo is not implemented');
  }
  overscanCalibrationAdjust(..._args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationAdjust is not implemented');
  }
  overscanCalibrationComplete(..._args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationComplete is not implemented');
  }
  overscanCalibrationReset(..._args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationReset is not implemented');
  }
  overscanCalibrationStart(..._args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationStart is not implemented');
  }
  setDisplayLayout(..._args: any[]): any {
    throw new Error('chrome.system.display.setDisplayLayout is not implemented');
  }
  setDisplayProperties(..._args: any[]): any {
    throw new Error('chrome.system.display.setDisplayProperties is not implemented');
  }
  setMirrorMode(..._args: any[]): any {
    throw new Error('chrome.system.display.setMirrorMode is not implemented');
  }
  showNativeTouchCalibration(..._args: any[]): any {
    throw new Error('chrome.system.display.showNativeTouchCalibration is not implemented');
  }
  startCustomTouchCalibration(..._args: any[]): any {
    throw new Error('chrome.system.display.startCustomTouchCalibration is not implemented');
  }

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
  getInfo(..._args: any[]): any {
    throw new Error('chrome.system.memory.getInfo is not implemented');
  }
}

export class ChromeSystemStorageBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onDetached: ChromeEvent = new ChromeEvent();
  public readonly onAttached: ChromeEvent = new ChromeEvent();

  ejectDevice(..._args: any[]): any {
    throw new Error('chrome.system.storage.ejectDevice is not implemented');
  }
  getInfo(..._args: any[]): any {
    throw new Error('chrome.system.storage.getInfo is not implemented');
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
