import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeRuntime {
  public readonly onRestartRequired: ChromeEvent = new ChromeEvent();
  public readonly onUserScriptMessage: ChromeEvent = new ChromeEvent();
  public readonly onMessageExternal: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();
  public readonly onConnectNative: ChromeEvent = new ChromeEvent();
  public readonly onUserScriptConnect: ChromeEvent = new ChromeEvent();
  public readonly onConnectExternal: ChromeEvent = new ChromeEvent();
  public readonly onConnect: ChromeEvent = new ChromeEvent();
  public readonly onBrowserUpdateAvailable: ChromeEvent = new ChromeEvent();
  public readonly onUpdateAvailable: ChromeEvent = new ChromeEvent();
  public readonly onSuspendCanceled: ChromeEvent = new ChromeEvent();
  public readonly onSuspend: ChromeEvent = new ChromeEvent();
  public readonly onInstalled: ChromeEvent = new ChromeEvent();
  public readonly onStartup: ChromeEvent = new ChromeEvent();
  public dynamicId: string = "d7c38c71-f4a2-4f49-970e-b01d78f082de";
  public id: string = "ggemfkgjflehnfniboecenpaljjbaggh";

  connect(...args: any[]): any {
    throw new Error('chrome.runtime.connect is not implemented');
  }

  connectNative(...args: any[]): any {
    throw new Error('chrome.runtime.connectNative is not implemented');
  }

  getContexts(...args: any[]): any {
    throw new Error('chrome.runtime.getContexts is not implemented');
  }

  getManifest(...args: any[]): any {
    throw new Error('chrome.runtime.getManifest is not implemented');
  }

  getPlatformInfo(...args: any[]): any {
    throw new Error('chrome.runtime.getPlatformInfo is not implemented');
  }

  getURL(...args: any[]): any {
    throw new Error('chrome.runtime.getURL is not implemented');
  }

  openOptionsPage(...args: any[]): any {
    throw new Error('chrome.runtime.openOptionsPage is not implemented');
  }

  reload(...args: any[]): any {
    throw new Error('chrome.runtime.reload is not implemented');
  }

  requestUpdateCheck(...args: any[]): any {
    throw new Error('chrome.runtime.requestUpdateCheck is not implemented');
  }

  restart(...args: any[]): any {
    throw new Error('chrome.runtime.restart is not implemented');
  }

  restartAfterDelay(...args: any[]): any {
    throw new Error('chrome.runtime.restartAfterDelay is not implemented');
  }

  sendMessage(...args: any[]): any {
    throw new Error('chrome.runtime.sendMessage is not implemented');
  }

  sendNativeMessage(...args: any[]): any {
    throw new Error('chrome.runtime.sendNativeMessage is not implemented');
  }

  setUninstallURL(...args: any[]): any {
    throw new Error('chrome.runtime.setUninstallURL is not implemented');
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
    PPC64: "ppc64",
    RISCV64: "riscv64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformNaclArch = {
    ARM: "arm",
    MIPS: "mips",
    MIPS64: "mips64",
    PPC64: "ppc64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformOs = {
    ANDROID: "android",
    CROS: "cros",
    FUCHSIA: "fuchsia",
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
