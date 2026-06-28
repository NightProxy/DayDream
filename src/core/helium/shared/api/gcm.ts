import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeGcm {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onSendError: ChromeEvent = new ChromeEvent();
  public readonly onMessagesDeleted: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();

  register(..._args: any[]): any {
    throw new Error('chrome.gcm.register is not implemented');
  }

  send(..._args: any[]): any {
    throw new Error('chrome.gcm.send is not implemented');
  }

  unregister(..._args: any[]): any {
    throw new Error('chrome.gcm.unregister is not implemented');
  }

  static readonly MAX_MESSAGE_SIZE: number = 4096;
}
