import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeWebAuthenticationProxy {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onRequestCanceled: ChromeEvent = new ChromeEvent();
  public readonly onIsUvpaaRequest: ChromeEvent = new ChromeEvent();
  public readonly onGetRequest: ChromeEvent = new ChromeEvent();
  public readonly onCreateRequest: ChromeEvent = new ChromeEvent();
  public readonly onRemoteSessionStateChange: ChromeEvent = new ChromeEvent();

  attach(..._args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.attach is not implemented');
  }

  completeCreateRequest(..._args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeCreateRequest is not implemented');
  }

  completeGetRequest(..._args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeGetRequest is not implemented');
  }

  completeIsUvpaaRequest(..._args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.completeIsUvpaaRequest is not implemented');
  }

  detach(..._args: any[]): any {
    throw new Error('chrome.webAuthenticationProxy.detach is not implemented');
  }

}
