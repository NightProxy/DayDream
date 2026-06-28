import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

export class ChromeTabCaptureBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onStatusChanged: ChromeEvent = new ChromeEvent();

  getCapturedTabs(..._args: any[]): any {
    throw new Error('chrome.tabCapture.getCapturedTabs is not implemented');
  }
  getMediaStreamId(..._args: any[]): any {
    throw new Error('chrome.tabCapture.getMediaStreamId is not implemented');
  }

  static readonly TabCaptureState = {
    ACTIVE: "active",
    ERROR: "error",
    PENDING: "pending",
    STOPPED: "stopped",
  } as const;
}
