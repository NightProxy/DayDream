import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeDebugger {
  public readonly onDetach: ChromeEvent = new ChromeEvent();
  public readonly onEvent: ChromeEvent = new ChromeEvent();

  attach(...args: any[]): any {
    throw new Error('chrome.debugger.attach is not implemented');
  }

  detach(...args: any[]): any {
    throw new Error('chrome.debugger.detach is not implemented');
  }

  getTargets(...args: any[]): any {
    throw new Error('chrome.debugger.getTargets is not implemented');
  }

  sendCommand(...args: any[]): any {
    throw new Error('chrome.debugger.sendCommand is not implemented');
  }

  static readonly DetachReason = {
    CANCELED_BY_USER: "canceled_by_user",
    TARGET_CLOSED: "target_closed",
  } as const;

  static readonly TargetInfoType = {
    BACKGROUND_PAGE: "background_page",
    OTHER: "other",
    PAGE: "page",
    WORKER: "worker",
  } as const;

}
