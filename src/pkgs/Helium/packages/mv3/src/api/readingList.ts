import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeReadingList {
  public readonly onEntryUpdated: ChromeEvent = new ChromeEvent();
  public readonly onEntryRemoved: ChromeEvent = new ChromeEvent();
  public readonly onEntryAdded: ChromeEvent = new ChromeEvent();

  addEntry(...args: any[]): any {
    throw new Error('chrome.readingList.addEntry is not implemented');
  }

  query(...args: any[]): any {
    throw new Error('chrome.readingList.query is not implemented');
  }

  removeEntry(...args: any[]): any {
    throw new Error('chrome.readingList.removeEntry is not implemented');
  }

  updateEntry(...args: any[]): any {
    throw new Error('chrome.readingList.updateEntry is not implemented');
  }

}
