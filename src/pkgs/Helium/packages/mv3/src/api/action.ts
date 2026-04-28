import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeAction {
  public readonly onUserSettingsChanged: ChromeEvent = new ChromeEvent();
  public readonly onClicked: ChromeEvent = new ChromeEvent();

  disable(...args: any[]): any {
    throw new Error('chrome.action.disable is not implemented');
  }

  enable(...args: any[]): any {
    throw new Error('chrome.action.enable is not implemented');
  }

  getBadgeBackgroundColor(...args: any[]): any {
    throw new Error('chrome.action.getBadgeBackgroundColor is not implemented');
  }

  getBadgeText(...args: any[]): any {
    throw new Error('chrome.action.getBadgeText is not implemented');
  }

  getBadgeTextColor(...args: any[]): any {
    throw new Error('chrome.action.getBadgeTextColor is not implemented');
  }

  getPopup(...args: any[]): any {
    throw new Error('chrome.action.getPopup is not implemented');
  }

  getTitle(...args: any[]): any {
    throw new Error('chrome.action.getTitle is not implemented');
  }

  getUserSettings(...args: any[]): any {
    throw new Error('chrome.action.getUserSettings is not implemented');
  }

  isEnabled(...args: any[]): any {
    throw new Error('chrome.action.isEnabled is not implemented');
  }

  openPopup(...args: any[]): any {
    throw new Error('chrome.action.openPopup is not implemented');
  }

  setBadgeBackgroundColor(...args: any[]): any {
    throw new Error('chrome.action.setBadgeBackgroundColor is not implemented');
  }

  setBadgeText(...args: any[]): any {
    throw new Error('chrome.action.setBadgeText is not implemented');
  }

  setBadgeTextColor(...args: any[]): any {
    throw new Error('chrome.action.setBadgeTextColor is not implemented');
  }

  setIcon(...args: any[]): any {
    throw new Error('chrome.action.setIcon is not implemented');
  }

  setPopup(...args: any[]): any {
    throw new Error('chrome.action.setPopup is not implemented');
  }

  setTitle(...args: any[]): any {
    throw new Error('chrome.action.setTitle is not implemented');
  }

}
