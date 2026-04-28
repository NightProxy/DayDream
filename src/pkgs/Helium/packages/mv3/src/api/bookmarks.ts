import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeBookmarks {
  public readonly onImportEnded: ChromeEvent = new ChromeEvent();
  public readonly onImportBegan: ChromeEvent = new ChromeEvent();
  public readonly onChildrenReordered: ChromeEvent = new ChromeEvent();
  public readonly onMoved: ChromeEvent = new ChromeEvent();
  public readonly onChanged: ChromeEvent = new ChromeEvent();
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  create(...args: any[]): any {
    throw new Error('chrome.bookmarks.create is not implemented');
  }

  get(...args: any[]): any {
    throw new Error('chrome.bookmarks.get is not implemented');
  }

  getChildren(...args: any[]): any {
    throw new Error('chrome.bookmarks.getChildren is not implemented');
  }

  getRecent(...args: any[]): any {
    throw new Error('chrome.bookmarks.getRecent is not implemented');
  }

  getSubTree(...args: any[]): any {
    throw new Error('chrome.bookmarks.getSubTree is not implemented');
  }

  getTree(...args: any[]): any {
    throw new Error('chrome.bookmarks.getTree is not implemented');
  }

  move(...args: any[]): any {
    throw new Error('chrome.bookmarks.move is not implemented');
  }

  remove(...args: any[]): any {
    throw new Error('chrome.bookmarks.remove is not implemented');
  }

  removeTree(...args: any[]): any {
    throw new Error('chrome.bookmarks.removeTree is not implemented');
  }

  search(...args: any[]): any {
    throw new Error('chrome.bookmarks.search is not implemented');
  }

  update(...args: any[]): any {
    throw new Error('chrome.bookmarks.update is not implemented');
  }

  static readonly BookmarkTreeNodeUnmodifiable = {
    MANAGED: "managed",
  } as const;

  static readonly FolderType = {
    BOOKMARKS_BAR: "bookmarks-bar",
    MANAGED: "managed",
    MOBILE: "mobile",
    OTHER: "other",
  } as const;

  static readonly MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: number = 1000000;
  static readonly MAX_WRITE_OPERATIONS_PER_HOUR: number = 1000000;
}
