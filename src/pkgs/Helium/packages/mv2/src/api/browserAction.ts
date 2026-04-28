import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeBrowserAction {
  public readonly onClicked: ChromeEvent = new ChromeEvent();

  disable(...args: any[]): any {
    throw new Error('chrome.browserAction.disable is not implemented');
  }

  enable(...args: any[]): any {
    throw new Error('chrome.browserAction.enable is not implemented');
  }

  getBadgeBackgroundColor(...args: any[]): any {
    throw new Error('chrome.browserAction.getBadgeBackgroundColor is not implemented');
  }

  getBadgeText(...args: any[]): any {
    throw new Error('chrome.browserAction.getBadgeText is not implemented');
  }

  getPopup(...args: any[]): any {
    throw new Error('chrome.browserAction.getPopup is not implemented');
  }

  getTitle(...args: any[]): any {
    throw new Error('chrome.browserAction.getTitle is not implemented');
  }

  setBadgeBackgroundColor(...args: any[]): any {
    throw new Error('chrome.browserAction.setBadgeBackgroundColor is not implemented');
  }

  setBadgeText(...args: any[]): any {
    throw new Error('chrome.browserAction.setBadgeText is not implemented');
  }

  setIcon(...args: any[]): any {
    throw new Error('chrome.browserAction.setIcon is not implemented');
  }

  setPopup(...args: any[]): any {
    throw new Error('chrome.browserAction.setPopup is not implemented');
  }

  setTitle(...args: any[]): any {
    throw new Error('chrome.browserAction.setTitle is not implemented');
  }

}
