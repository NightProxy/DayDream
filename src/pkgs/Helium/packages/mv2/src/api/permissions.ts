import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromePermissions {
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onAdded: ChromeEvent = new ChromeEvent();

  contains(...args: any[]): any {
    throw new Error('chrome.permissions.contains is not implemented');
  }

  getAll(...args: any[]): any {
    throw new Error('chrome.permissions.getAll is not implemented');
  }

  remove(...args: any[]): any {
    throw new Error('chrome.permissions.remove is not implemented');
  }

  request(...args: any[]): any {
    throw new Error('chrome.permissions.request is not implemented');
  }

}
