import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeInstanceID {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onTokenRefresh: ChromeEvent = new ChromeEvent();

  deleteID(..._args: any[]): any {
    throw new Error('chrome.instanceID.deleteID is not implemented');
  }

  deleteToken(..._args: any[]): any {
    throw new Error('chrome.instanceID.deleteToken is not implemented');
  }

  getCreationTime(..._args: any[]): any {
    throw new Error('chrome.instanceID.getCreationTime is not implemented');
  }

  getID(..._args: any[]): any {
    throw new Error('chrome.instanceID.getID is not implemented');
  }

  getToken(..._args: any[]): any {
    throw new Error('chrome.instanceID.getToken is not implemented');
  }

}
