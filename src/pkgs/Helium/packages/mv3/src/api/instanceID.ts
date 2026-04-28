import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeInstanceID {
  public readonly onTokenRefresh: ChromeEvent = new ChromeEvent();

  deleteID(...args: any[]): any {
    throw new Error('chrome.instanceID.deleteID is not implemented');
  }

  deleteToken(...args: any[]): any {
    throw new Error('chrome.instanceID.deleteToken is not implemented');
  }

  getCreationTime(...args: any[]): any {
    throw new Error('chrome.instanceID.getCreationTime is not implemented');
  }

  getID(...args: any[]): any {
    throw new Error('chrome.instanceID.getID is not implemented');
  }

  getToken(...args: any[]): any {
    throw new Error('chrome.instanceID.getToken is not implemented');
  }

}
