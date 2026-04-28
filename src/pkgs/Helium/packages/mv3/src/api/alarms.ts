import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeAlarms {
  public readonly onAlarm: ChromeEvent = new ChromeEvent();

  clear(...args: any[]): any {
    throw new Error('chrome.alarms.clear is not implemented');
  }

  clearAll(...args: any[]): any {
    throw new Error('chrome.alarms.clearAll is not implemented');
  }

  create(...args: any[]): any {
    throw new Error('chrome.alarms.create is not implemented');
  }

  get(...args: any[]): any {
    throw new Error('chrome.alarms.get is not implemented');
  }

  getAll(...args: any[]): any {
    throw new Error('chrome.alarms.getAll is not implemented');
  }

}
