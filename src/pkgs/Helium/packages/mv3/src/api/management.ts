import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeManagement {
  public readonly onDisabled: ChromeEvent = new ChromeEvent();
  public readonly onEnabled: ChromeEvent = new ChromeEvent();
  public readonly onUninstalled: ChromeEvent = new ChromeEvent();
  public readonly onInstalled: ChromeEvent = new ChromeEvent();

  createAppShortcut(...args: any[]): any {
    throw new Error('chrome.management.createAppShortcut is not implemented');
  }

  generateAppForLink(...args: any[]): any {
    throw new Error('chrome.management.generateAppForLink is not implemented');
  }

  get(...args: any[]): any {
    throw new Error('chrome.management.get is not implemented');
  }

  getAll(...args: any[]): any {
    throw new Error('chrome.management.getAll is not implemented');
  }

  getPermissionWarningsById(...args: any[]): any {
    throw new Error('chrome.management.getPermissionWarningsById is not implemented');
  }

  getPermissionWarningsByManifest(...args: any[]): any {
    throw new Error('chrome.management.getPermissionWarningsByManifest is not implemented');
  }

  getSelf(...args: any[]): any {
    throw new Error('chrome.management.getSelf is not implemented');
  }

  launchApp(...args: any[]): any {
    throw new Error('chrome.management.launchApp is not implemented');
  }

  setEnabled(...args: any[]): any {
    throw new Error('chrome.management.setEnabled is not implemented');
  }

  setLaunchType(...args: any[]): any {
    throw new Error('chrome.management.setLaunchType is not implemented');
  }

  uninstall(...args: any[]): any {
    throw new Error('chrome.management.uninstall is not implemented');
  }

  uninstallSelf(...args: any[]): any {
    throw new Error('chrome.management.uninstallSelf is not implemented');
  }

  static readonly ExtensionDisabledReason = {
    PERMISSIONS_INCREASE: "permissions_increase",
    UNKNOWN: "unknown",
  } as const;

  static readonly ExtensionInstallType = {
    ADMIN: "admin",
    DEVELOPMENT: "development",
    NORMAL: "normal",
    OTHER: "other",
    SIDELOAD: "sideload",
  } as const;

  static readonly ExtensionType = {
    EXTENSION: "extension",
    HOSTED_APP: "hosted_app",
    LEGACY_PACKAGED_APP: "legacy_packaged_app",
    LOGIN_SCREEN_EXTENSION: "login_screen_extension",
    PACKAGED_APP: "packaged_app",
    THEME: "theme",
  } as const;

  static readonly LaunchType = {
    OPEN_AS_PINNED_TAB: "OPEN_AS_PINNED_TAB",
    OPEN_AS_REGULAR_TAB: "OPEN_AS_REGULAR_TAB",
    OPEN_AS_WINDOW: "OPEN_AS_WINDOW",
    OPEN_FULL_SCREEN: "OPEN_FULL_SCREEN",
  } as const;

}
