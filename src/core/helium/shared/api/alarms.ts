import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeAlarms {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onAlarm: ChromeEvent = new ChromeEvent();

  clear(..._args: any[]): any {
    throw new Error('chrome.alarms.clear is not implemented');
  }

  clearAll(..._args: any[]): any {
    throw new Error('chrome.alarms.clearAll is not implemented');
  }

  create(..._args: any[]): any {
    throw new Error('chrome.alarms.create is not implemented');
  }

  get(..._args: any[]): any {
    throw new Error('chrome.alarms.get is not implemented');
  }

  getAll(..._args: any[]): any {
    throw new Error('chrome.alarms.getAll is not implemented');
  }

}
