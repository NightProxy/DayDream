import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeNotifications {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onShowSettings: ChromeEvent = new ChromeEvent();
  public readonly onPermissionLevelChanged: ChromeEvent = new ChromeEvent();
  public readonly onButtonClicked: ChromeEvent = new ChromeEvent();
  public readonly onClicked: ChromeEvent = new ChromeEvent();
  public readonly onClosed: ChromeEvent = new ChromeEvent();

  clear(..._args: any[]): any {
    throw new Error('chrome.notifications.clear is not implemented');
  }

  create(..._args: any[]): any {
    throw new Error('chrome.notifications.create is not implemented');
  }

  getAll(..._args: any[]): any {
    throw new Error('chrome.notifications.getAll is not implemented');
  }

  getPermissionLevel(..._args: any[]): any {
    throw new Error('chrome.notifications.getPermissionLevel is not implemented');
  }

  update(..._args: any[]): any {
    throw new Error('chrome.notifications.update is not implemented');
  }

  static readonly PermissionLevel = {
    DENIED: "denied",
    GRANTED: "granted",
  } as const;

  static readonly TemplateType = {
    BASIC: "basic",
    IMAGE: "image",
    LIST: "list",
    PROGRESS: "progress",
  } as const;

}
