import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeAction {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onUserSettingsChanged: ChromeEvent = new ChromeEvent();
  public readonly onClicked: ChromeEvent = new ChromeEvent();

  disable(..._args: any[]): any {
    throw new Error('chrome.action.disable is not implemented');
  }

  enable(..._args: any[]): any {
    throw new Error('chrome.action.enable is not implemented');
  }

  getBadgeBackgroundColor(..._args: any[]): any {
    throw new Error('chrome.action.getBadgeBackgroundColor is not implemented');
  }

  getBadgeText(..._args: any[]): any {
    throw new Error('chrome.action.getBadgeText is not implemented');
  }

  getBadgeTextColor(..._args: any[]): any {
    throw new Error('chrome.action.getBadgeTextColor is not implemented');
  }

  getPopup(..._args: any[]): any {
    throw new Error('chrome.action.getPopup is not implemented');
  }

  getTitle(..._args: any[]): any {
    throw new Error('chrome.action.getTitle is not implemented');
  }

  getUserSettings(..._args: any[]): any {
    throw new Error('chrome.action.getUserSettings is not implemented');
  }

  isEnabled(..._args: any[]): any {
    throw new Error('chrome.action.isEnabled is not implemented');
  }

  openPopup(..._args: any[]): any {
    throw new Error('chrome.action.openPopup is not implemented');
  }

  setBadgeBackgroundColor(..._args: any[]): any {
    throw new Error('chrome.action.setBadgeBackgroundColor is not implemented');
  }

  setBadgeText(..._args: any[]): any {
    throw new Error('chrome.action.setBadgeText is not implemented');
  }

  setBadgeTextColor(..._args: any[]): any {
    throw new Error('chrome.action.setBadgeTextColor is not implemented');
  }

  setIcon(..._args: any[]): any {
    throw new Error('chrome.action.setIcon is not implemented');
  }

  setPopup(..._args: any[]): any {
    throw new Error('chrome.action.setPopup is not implemented');
  }

  setTitle(..._args: any[]): any {
    throw new Error('chrome.action.setTitle is not implemented');
  }

}
