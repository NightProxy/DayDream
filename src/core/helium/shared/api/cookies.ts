import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeCookies {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onChanged: ChromeEvent = new ChromeEvent();

  get(..._args: any[]): any {
    throw new Error('chrome.cookies.get is not implemented');
  }

  getAll(..._args: any[]): any {
    throw new Error('chrome.cookies.getAll is not implemented');
  }

  getAllCookieStores(..._args: any[]): any {
    throw new Error('chrome.cookies.getAllCookieStores is not implemented');
  }

  getPartitionKey(..._args: any[]): any {
    throw new Error('chrome.cookies.getPartitionKey is not implemented');
  }

  remove(..._args: any[]): any {
    throw new Error('chrome.cookies.remove is not implemented');
  }

  set(..._args: any[]): any {
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
