import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeReadingList {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onEntryUpdated: ChromeEvent = new ChromeEvent();
  public readonly onEntryRemoved: ChromeEvent = new ChromeEvent();
  public readonly onEntryAdded: ChromeEvent = new ChromeEvent();

  addEntry(..._args: any[]): any {
    throw new Error('chrome.readingList.addEntry is not implemented');
  }

  query(..._args: any[]): any {
    throw new Error('chrome.readingList.query is not implemented');
  }

  removeEntry(..._args: any[]): any {
    throw new Error('chrome.readingList.removeEntry is not implemented');
  }

  updateEntry(..._args: any[]): any {
    throw new Error('chrome.readingList.updateEntry is not implemented');
  }

}
