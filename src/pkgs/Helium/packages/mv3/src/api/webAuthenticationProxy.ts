import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeWebAuthenticationProxy {
  public readonly onRequestCanceled: ChromeEvent = new ChromeEvent();
  public readonly onIsUvpaaRequest: ChromeEvent = new ChromeEvent();
  public readonly onGetRequest: ChromeEvent = new ChromeEvent();
  public readonly onCreateRequest: ChromeEvent = new ChromeEvent();
  public readonly onRemoteSessionStateChange: ChromeEvent = new ChromeEvent();

  attach(...args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.attach is not implemented');
  }

  completeCreateRequest(...args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeCreateRequest is not implemented');
  }

  completeGetRequest(...args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeGetRequest is not implemented');
  }

  completeIsUvpaaRequest(...args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeIsUvpaaRequest is not implemented');
  }

  detach(...args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.detach is not implemented');
  }

}
