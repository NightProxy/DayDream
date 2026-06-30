
import type { ExtensionManager } from '@apis/extensions';
import { ReadingListManager } from '@apis/readingList';

export function installReadingListEventListeners(
  extMgr: ExtensionManager,
): () => void {
  const mgr = ReadingListManager.getInstance();
  return mgr.addChangeListener((event) => {
    switch (event.type) {
      case 'added':
        extMgr.fanoutEvent(
          'chrome.readingList.onEntryAdded',
          [event.entry],
          'readingList',
        );
        break;
      case 'updated':
        extMgr.fanoutEvent(
          'chrome.readingList.onEntryUpdated',
          [event.entry],
          'readingList',
        );
        break;
      case 'removed':
        extMgr.fanoutEvent(
          'chrome.readingList.onEntryRemoved',
          [event.entry],
          'readingList',
        );
        break;
    }
  });
}
