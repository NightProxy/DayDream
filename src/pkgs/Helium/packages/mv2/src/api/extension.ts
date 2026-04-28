import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeExtension {
  public readonly onRequestExternal: ChromeEvent = new ChromeEvent();
  public readonly onRequest: ChromeEvent = new ChromeEvent();
  public readonly onConnect: ChromeEvent = new ChromeEvent();
  public readonly onConnectExternal: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();
  public readonly onMessageExternal: ChromeEvent = new ChromeEvent();
  public inIncognitoContext: boolean = false;

  getBackgroundPage(...args: any[]): any {
    throw new Error('chrome.extension.getBackgroundPage is not implemented');
  }

  getExtensionTabs(...args: any[]): any {
    throw new Error('chrome.extension.getExtensionTabs is not implemented');
  }

  getURL(...args: any[]): any {
    throw new Error('chrome.extension.getURL is not implemented');
  }

  getViews(...args: any[]): any {
    throw new Error('chrome.extension.getViews is not implemented');
  }

  isAllowedFileSchemeAccess(...args: any[]): any {
    throw new Error('chrome.extension.isAllowedFileSchemeAccess is not implemented');
  }

  isAllowedIncognitoAccess(...args: any[]): any {
    throw new Error('chrome.extension.isAllowedIncognitoAccess is not implemented');
  }

  sendRequest(...args: any[]): any {
    throw new Error('chrome.extension.sendRequest is not implemented');
  }

  setUpdateUrlData(...args: any[]): any {
    throw new Error('chrome.extension.setUpdateUrlData is not implemented');
  }

  connect(...args: any[]): any {
    throw new Error('chrome.extension.connect is not implemented');
  }

  connectNative(...args: any[]): any {
    throw new Error('chrome.extension.connectNative is not implemented');
  }

  sendMessage(...args: any[]): any {
    throw new Error('chrome.extension.sendMessage is not implemented');
  }

  sendNativeMessage(...args: any[]): any {
    throw new Error('chrome.extension.sendNativeMessage is not implemented');
  }

  static readonly ViewType = {
    POPUP: "popup",
    TAB: "tab",
  } as const;

}
