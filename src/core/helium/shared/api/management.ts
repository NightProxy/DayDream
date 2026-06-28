import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

export class ChromeManagementBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onDisabled: ChromeEvent = new ChromeEvent();
  public readonly onEnabled: ChromeEvent = new ChromeEvent();
  public readonly onUninstalled: ChromeEvent = new ChromeEvent();
  public readonly onInstalled: ChromeEvent = new ChromeEvent();

  createAppShortcut(..._args: any[]): any {
    throw new Error('chrome.management.createAppShortcut is not implemented');
  }
  generateAppForLink(..._args: any[]): any {
    throw new Error('chrome.management.generateAppForLink is not implemented');
  }
  get(..._args: any[]): any {
    throw new Error('chrome.management.get is not implemented');
  }
  getAll(..._args: any[]): any {
    throw new Error('chrome.management.getAll is not implemented');
  }
  getPermissionWarningsById(..._args: any[]): any {
    throw new Error('chrome.management.getPermissionWarningsById is not implemented');
  }
  getPermissionWarningsByManifest(..._args: any[]): any {
    throw new Error('chrome.management.getPermissionWarningsByManifest is not implemented');
  }
  getSelf(..._args: any[]): any {
    throw new Error('chrome.management.getSelf is not implemented');
  }
  launchApp(..._args: any[]): any {
    throw new Error('chrome.management.launchApp is not implemented');
  }
  setEnabled(..._args: any[]): any {
    throw new Error('chrome.management.setEnabled is not implemented');
  }
  setLaunchType(..._args: any[]): any {
    throw new Error('chrome.management.setLaunchType is not implemented');
  }
  uninstall(..._args: any[]): any {
    throw new Error('chrome.management.uninstall is not implemented');
  }
  uninstallSelf(..._args: any[]): any {
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
