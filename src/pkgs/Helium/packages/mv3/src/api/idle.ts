import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeIdle {
  public readonly onStateChanged: ChromeEvent = new ChromeEvent();

  queryState(...args: any[]): any {
    throw new Error('chrome.idle.queryState is not implemented');
  }

  setDetectionInterval(...args: any[]): any {
    throw new Error('chrome.idle.setDetectionInterval is not implemented');
  }

  static readonly IdleState = {
    ACTIVE: "active",
    IDLE: "idle",
    LOCKED: "locked",
  } as const;

}
