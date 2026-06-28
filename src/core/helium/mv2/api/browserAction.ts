import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeBrowserAction {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onClicked: ChromeEvent = new ChromeEvent();

  disable(..._args: any[]): any {
    throw new Error('chrome.browserAction.disable is not implemented');
  }

  enable(..._args: any[]): any {
    throw new Error('chrome.browserAction.enable is not implemented');
  }

  getBadgeBackgroundColor(..._args: any[]): any {
    throw new Error('chrome.browserAction.getBadgeBackgroundColor is not implemented');
  }

  getBadgeText(..._args: any[]): any {
    throw new Error('chrome.browserAction.getBadgeText is not implemented');
  }

  getPopup(..._args: any[]): any {
    throw new Error('chrome.browserAction.getPopup is not implemented');
  }

  getTitle(..._args: any[]): any {
    throw new Error('chrome.browserAction.getTitle is not implemented');
  }

  setBadgeBackgroundColor(..._args: any[]): any {
    throw new Error('chrome.browserAction.setBadgeBackgroundColor is not implemented');
  }

  setBadgeText(..._args: any[]): any {
    throw new Error('chrome.browserAction.setBadgeText is not implemented');
  }

  setIcon(..._args: any[]): any {
    throw new Error('chrome.browserAction.setIcon is not implemented');
  }

  setPopup(..._args: any[]): any {
    throw new Error('chrome.browserAction.setPopup is not implemented');
  }

  setTitle(..._args: any[]): any {
    throw new Error('chrome.browserAction.setTitle is not implemented');
  }

}
