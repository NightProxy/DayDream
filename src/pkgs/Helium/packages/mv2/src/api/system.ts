import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeSystemCpu {

  getInfo(...args: any[]): any {
    throw new Error('chrome.system.cpu.getInfo is not implemented');
  }

}

export class ChromeSystemDisplay {
  public readonly onDisplayChanged: ChromeEvent = new ChromeEvent();

  clearTouchCalibration(...args: any[]): any {
    throw new Error('chrome.system.display.clearTouchCalibration is not implemented');
  }

  completeCustomTouchCalibration(...args: any[]): any {
    throw new Error('chrome.system.display.completeCustomTouchCalibration is not implemented');
  }

  enableUnifiedDesktop(...args: any[]): any {
    throw new Error('chrome.system.display.enableUnifiedDesktop is not implemented');
  }

  getDisplayLayout(...args: any[]): any {
    throw new Error('chrome.system.display.getDisplayLayout is not implemented');
  }

  getInfo(...args: any[]): any {
    throw new Error('chrome.system.display.getInfo is not implemented');
  }

  overscanCalibrationAdjust(...args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationAdjust is not implemented');
  }

  overscanCalibrationComplete(...args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationComplete is not implemented');
  }

  overscanCalibrationReset(...args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationReset is not implemented');
  }

  overscanCalibrationStart(...args: any[]): any {
    throw new Error('chrome.system.display.overscanCalibrationStart is not implemented');
  }

  setDisplayLayout(...args: any[]): any {
    throw new Error('chrome.system.display.setDisplayLayout is not implemented');
  }

  setDisplayProperties(...args: any[]): any {
    throw new Error('chrome.system.display.setDisplayProperties is not implemented');
  }

  setMirrorMode(...args: any[]): any {
    throw new Error('chrome.system.display.setMirrorMode is not implemented');
  }

  showNativeTouchCalibration(...args: any[]): any {
    throw new Error('chrome.system.display.showNativeTouchCalibration is not implemented');
  }

  startCustomTouchCalibration(...args: any[]): any {
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

export class ChromeSystemMemory {

  getInfo(...args: any[]): any {
    throw new Error('chrome.system.memory.getInfo is not implemented');
  }

}

export class ChromeSystemStorage {
  public readonly onDetached: ChromeEvent = new ChromeEvent();
  public readonly onAttached: ChromeEvent = new ChromeEvent();

  ejectDevice(...args: any[]): any {
    throw new Error('chrome.system.storage.ejectDevice is not implemented');
  }

  getInfo(...args: any[]): any {
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

export class ChromeSystem {
  public readonly cpu: ChromeSystemCpu = new ChromeSystemCpu();
  public readonly display: ChromeSystemDisplay = new ChromeSystemDisplay();
  public readonly memory: ChromeSystemMemory = new ChromeSystemMemory();
  public readonly storage: ChromeSystemStorage = new ChromeSystemStorage();

}
