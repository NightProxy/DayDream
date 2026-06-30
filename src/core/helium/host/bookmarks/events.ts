
import type { ExtensionManager } from '@apis/extensions';
import { BookmarkManager } from '@apis/bookmarks';

export function installBookmarkEventListeners(extMgr: ExtensionManager): () => void {
  const mgr = BookmarkManager.getInstance();
  return mgr.addChangeListener((event) => {
    switch (event.type) {
      case 'created':
        extMgr.fanoutEvent('chrome.bookmarks.onCreated', [event.id, event.node], 'bookmarks');
        break;
      case 'removed':
        extMgr.fanoutEvent('chrome.bookmarks.onRemoved', [event.id, event.info], 'bookmarks');
        break;
      case 'changed':
        extMgr.fanoutEvent('chrome.bookmarks.onChanged', [event.id, event.changes], 'bookmarks');
        break;
      case 'moved':
        extMgr.fanoutEvent('chrome.bookmarks.onMoved', [event.id, event.info], 'bookmarks');
        break;
    }
  });
}
