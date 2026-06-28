import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeIdle {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onStateChanged: ChromeEvent = new ChromeEvent();

  queryState(..._args: any[]): any {
    throw new Error('chrome.idle.queryState is not implemented');
  }

  setDetectionInterval(..._args: any[]): any {
    throw new Error('chrome.idle.setDetectionInterval is not implemented');
  }

  static readonly IdleState = {
    ACTIVE: "active",
    IDLE: "idle",
    LOCKED: "locked",
  } as const;

}
