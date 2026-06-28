import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeBookmarks {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onImportEnded: ChromeEvent = new ChromeEvent();
  public readonly onImportBegan: ChromeEvent = new ChromeEvent();
  public readonly onChildrenReordered: ChromeEvent = new ChromeEvent();
  public readonly onMoved: ChromeEvent = new ChromeEvent();
  public readonly onChanged: ChromeEvent = new ChromeEvent();
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  create(..._args: any[]): any {
    throw new Error('chrome.bookmarks.create is not implemented');
  }

  get(..._args: any[]): any {
    throw new Error('chrome.bookmarks.get is not implemented');
  }

  getChildren(..._args: any[]): any {
    throw new Error('chrome.bookmarks.getChildren is not implemented');
  }

  getRecent(..._args: any[]): any {
    throw new Error('chrome.bookmarks.getRecent is not implemented');
  }

  getSubTree(..._args: any[]): any {
    throw new Error('chrome.bookmarks.getSubTree is not implemented');
  }

  getTree(..._args: any[]): any {
    throw new Error('chrome.bookmarks.getTree is not implemented');
  }

  move(..._args: any[]): any {
    throw new Error('chrome.bookmarks.move is not implemented');
  }

  remove(..._args: any[]): any {
    throw new Error('chrome.bookmarks.remove is not implemented');
  }

  removeTree(..._args: any[]): any {
    throw new Error('chrome.bookmarks.removeTree is not implemented');
  }

  search(..._args: any[]): any {
    throw new Error('chrome.bookmarks.search is not implemented');
  }

  update(..._args: any[]): any {
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
