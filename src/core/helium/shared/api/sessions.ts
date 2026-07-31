import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeSessions {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onChanged: ChromeEvent = new ChromeEvent();

  getDevices(..._args: any[]): any {
    throw new Error('chrome.sessions.getDevices is not implemented');
  }

  getRecentlyClosed(..._args: any[]): any {
    throw new Error('chrome.sessions.getRecentlyClosed is not implemented');
  }

  restore(..._args: any[]): any {
    throw new Error('chrome.sessions.restore is not implemented');
  }

  static readonly MAX_SESSION_RESULTS: number = 25;
}
