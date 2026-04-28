import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeGcm {
  public readonly onSendError: ChromeEvent = new ChromeEvent();
  public readonly onMessagesDeleted: ChromeEvent = new ChromeEvent();
  public readonly onMessage: ChromeEvent = new ChromeEvent();

  register(...args: any[]): any {
    throw new Error('chrome.gcm.register is not implemented');
  }

  send(...args: any[]): any {
    throw new Error('chrome.gcm.send is not implemented');
  }

  unregister(...args: any[]): any {
    throw new Error('chrome.gcm.unregister is not implemented');
  }

  static readonly MAX_MESSAGE_SIZE: number = 4096;
}
