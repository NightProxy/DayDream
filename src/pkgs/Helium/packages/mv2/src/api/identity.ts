import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeIdentity {
  public readonly onSignInChanged: ChromeEvent = new ChromeEvent();

  clearAllCachedAuthTokens(...args: any[]): any {
    throw new Error('chrome.identity.clearAllCachedAuthTokens is not implemented');
  }

  getAuthToken(...args: any[]): any {
    throw new Error('chrome.identity.getAuthToken is not implemented');
  }

  getProfileUserInfo(...args: any[]): any {
    throw new Error('chrome.identity.getProfileUserInfo is not implemented');
  }

  getRedirectURL(...args: any[]): any {
    throw new Error('chrome.identity.getRedirectURL is not implemented');
  }

  launchWebAuthFlow(...args: any[]): any {
    throw new Error('chrome.identity.launchWebAuthFlow is not implemented');
  }

  removeCachedAuthToken(...args: any[]): any {
    throw new Error('chrome.identity.removeCachedAuthToken is not implemented');
  }

  static readonly AccountStatus = {
    ANY: "ANY",
    SYNC: "SYNC",
  } as const;

}
