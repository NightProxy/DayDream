import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeTabCapture {
  public readonly onStatusChanged: ChromeEvent = new ChromeEvent();

  getCapturedTabs(...args: any[]): any {
    throw new Error('chrome.tabCapture.getCapturedTabs is not implemented');
  }

  getMediaStreamId(...args: any[]): any {
    throw new Error('chrome.tabCapture.getMediaStreamId is not implemented');
  }

  static readonly TabCaptureState = {
    ACTIVE: "active",
    ERROR: "error",
    PENDING: "pending",
    STOPPED: "stopped",
  } as const;

}
