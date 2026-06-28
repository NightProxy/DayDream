// src/core/helium/host/bookmarks/handlers.ts
//
// chrome.bookmarks.* handlers backed by the DDX BookmarkManager singleton.
// All node shapes mirror Chrome's BookmarkTreeNode loosely (only the
// fields the manager has are filled).

import type { ExtensionContext } from '../../extfs/types';
import {
  BookmarkManager,
  isBookmark,
  type BookmarkFolder,
  type BookmarkItem,
  type BookmarkTreeNode,
} from '@apis/bookmarks';

interface ChromeBookmarkNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  children?: ChromeBookmarkNode[];
}

function toChromeNode(item: BookmarkItem): ChromeBookmarkNode {
  const node: ChromeBookmarkNode = {
    id: item.id,
    title: item.title,
    index: item.index,
    dateAdded: item.createdAt instanceof Date ? item.createdAt.getTime() : undefined,
  };
  if (item.parentId !== undefined) node.parentId = item.parentId;
  if (isBookmark(item)) node.url = item.url;
  return node;
}

function treeToNode(node: BookmarkTreeNode): ChromeBookmarkNode {
  const out = toChromeNode(node.item);
  if (node.children && node.children.length > 0) {
    out.children = node.children.map((c) => treeToNode(c));
  } else if (!isBookmark(node.item)) {
    out.children = [];
  }
  return out;
}

export class BookmarksHandlers {
  private readonly mgr: BookmarkManager;

  constructor() {
    this.mgr = BookmarkManager.getInstance();
  }

  get = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const idArg = args[0];
    const ids = Array.isArray(idArg) ? idArg : [idArg];
    const out: ChromeBookmarkNode[] = [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      const item = this.mgr.getItemById(id);
      if (item) out.push(toChromeNode(item));
    }
    return out;
  };

  getChildren = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const items = this.mgr.getItemsByParent(args[0] as string | undefined);
    return items.map(toChromeNode);
  };

  getRecent = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const n = Number(args[0] ?? 10);
    return this.mgr
      .getBookmarks()
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, n)
      .map((b) => toChromeNode(b));
  };

  getTree = async (_ctx: ExtensionContext, _args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const tree = this.mgr.buildTree(undefined);
    return [
      {
        id: '0',
        title: '',
        children: tree.map((n) => treeToNode(n)),
      },
    ];
  };

  getSubTree = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const id = args[0] as string;
    const item = this.mgr.getItemById(id);
    if (!item) return [];
    const children = this.mgr.buildTree(id);
    const root = toChromeNode(item);
    root.children = children.map((n) => treeToNode(n));
    return [root];
  };

  search = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode[]> => {
    const q = typeof args[0] === 'string'
      ? args[0]
      : (args[0] as { query?: string } | undefined)?.query ?? '';
    return this.mgr.searchBookmarks(q).map(toChromeNode);
  };

  create = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode> => {
    const data = args[0] as { title?: string; url?: string; parentId?: string; index?: number };
    if (data?.url) {
      const opts: { title: string; url: string; parentId?: string } = {
        title: data.title ?? data.url,
        url: data.url,
      };
      if (data.parentId !== undefined) opts.parentId = data.parentId;
      const b = await this.mgr.createBookmark(opts);
      return toChromeNode(b);
    }
    const folderOpts: { title: string; parentId?: string } = {
      title: data?.title ?? 'New Folder',
    };
    if (data?.parentId !== undefined) folderOpts.parentId = data.parentId;
    const f = await this.mgr.createFolder(folderOpts);
    return toChromeNode(f);
  };

  move = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode> => {
    const id = args[0] as string;
    const dest = args[1] as { parentId?: string; index?: number };
    const item = this.mgr.getItemById(id);
    if (!item) throw new Error(`Bookmark ${id} not found`);
    const moveData: { itemId: string; newParentId?: string; newIndex: number } = {
      itemId: id,
      newIndex: dest?.index ?? item.index,
    };
    if (dest?.parentId !== undefined) moveData.newParentId = dest.parentId;
    else if (item.parentId !== undefined) moveData.newParentId = item.parentId;
    await this.mgr.moveItem(moveData);
    const moved = this.mgr.getItemById(id);
    if (!moved) throw new Error(`Bookmark ${id} disappeared after move`);
    return toChromeNode(moved);
  };

  update = async (_ctx: ExtensionContext, args: unknown[]): Promise<ChromeBookmarkNode> => {
    const id = args[0] as string;
    const changes = args[1] as { title?: string; url?: string };
    const item = this.mgr.getItemById(id);
    if (!item) throw new Error(`Bookmark ${id} not found`);
    if (isBookmark(item)) {
      await this.mgr.updateBookmark(id, changes);
    } else {
      const folderChanges: Partial<Omit<BookmarkFolder, 'id' | 'createdAt'>> = {};
      if (changes.title !== undefined) folderChanges.title = changes.title;
      await this.mgr.updateFolder(id, folderChanges);
    }
    const updated = this.mgr.getItemById(id);
    if (!updated) throw new Error(`Bookmark ${id} disappeared after update`);
    return toChromeNode(updated);
  };

  remove = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const id = args[0] as string;
    const item = this.mgr.getItemById(id);
    if (!item) return;
    if (isBookmark(item)) await this.mgr.deleteBookmark(id);
    else await this.mgr.deleteFolder(id, false);
  };

  removeTree = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    await this.mgr.deleteFolder(args[0] as string, true);
  };
}
