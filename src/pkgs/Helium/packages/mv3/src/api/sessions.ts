import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeSessions {
  public readonly onChanged: ChromeEvent = new ChromeEvent();

  getDevices(...args: any[]): any {
    throw new Error('chrome.sessions.getDevices is not implemented');
  }

  getRecentlyClosed(...args: any[]): any {
    throw new Error('chrome.sessions.getRecentlyClosed is not implemented');
  }

  restore(...args: any[]): any {
    throw new Error('chrome.sessions.restore is not implemented');
  }

  static readonly MAX_SESSION_RESULTS: number = 25;
}
