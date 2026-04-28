import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeCookies {
  public readonly onChanged: ChromeEvent = new ChromeEvent();

  get(...args: any[]): any {
    throw new Error('chrome.cookies.get is not implemented');
  }

  getAll(...args: any[]): any {
    throw new Error('chrome.cookies.getAll is not implemented');
  }

  getAllCookieStores(...args: any[]): any {
    throw new Error('chrome.cookies.getAllCookieStores is not implemented');
  }

  getPartitionKey(...args: any[]): any {
    throw new Error('chrome.cookies.getPartitionKey is not implemented');
  }

  remove(...args: any[]): any {
    throw new Error('chrome.cookies.remove is not implemented');
  }

  set(...args: any[]): any {
    throw new Error('chrome.cookies.set is not implemented');
  }

  static readonly OnChangedCause = {
    EVICTED: "evicted",
    EXPIRED: "expired",
    EXPIRED_OVERWRITE: "expired_overwrite",
    EXPLICIT: "explicit",
    OVERWRITE: "overwrite",
  } as const;

  static readonly SameSiteStatus = {
    LAX: "lax",
    NO_RESTRICTION: "no_restriction",
    STRICT: "strict",
    UNSPECIFIED: "unspecified",
  } as const;

}
