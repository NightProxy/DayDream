import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeNotifications {
  public readonly onShowSettings: ChromeEvent = new ChromeEvent();
  public readonly onPermissionLevelChanged: ChromeEvent = new ChromeEvent();
  public readonly onButtonClicked: ChromeEvent = new ChromeEvent();
  public readonly onClicked: ChromeEvent = new ChromeEvent();
  public readonly onClosed: ChromeEvent = new ChromeEvent();

  clear(...args: any[]): any {
    throw new Error('chrome.notifications.clear is not implemented');
  }

  create(...args: any[]): any {
    throw new Error('chrome.notifications.create is not implemented');
  }

  getAll(...args: any[]): any {
    throw new Error('chrome.notifications.getAll is not implemented');
  }

  getPermissionLevel(...args: any[]): any {
    throw new Error('chrome.notifications.getPermissionLevel is not implemented');
  }

  update(...args: any[]): any {
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
