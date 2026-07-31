import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

export class ChromeIdentityBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onSignInChanged: ChromeEvent = new ChromeEvent();

  clearAllCachedAuthTokens(..._args: any[]): any {
    throw new Error('chrome.identity.clearAllCachedAuthTokens is not implemented');
  }
  getAuthToken(..._args: any[]): any {
    throw new Error('chrome.identity.getAuthToken is not implemented');
  }
  getProfileUserInfo(..._args: any[]): any {
    throw new Error('chrome.identity.getProfileUserInfo is not implemented');
  }
  getRedirectURL(..._args: any[]): any {
    throw new Error('chrome.identity.getRedirectURL is not implemented');
  }
  launchWebAuthFlow(..._args: any[]): any {
    throw new Error('chrome.identity.launchWebAuthFlow is not implemented');
  }
  removeCachedAuthToken(..._args: any[]): any {
    throw new Error('chrome.identity.removeCachedAuthToken is not implemented');
  }

  static readonly AccountStatus = {
    ANY: "ANY",
    SYNC: "SYNC",
  } as const;
}
