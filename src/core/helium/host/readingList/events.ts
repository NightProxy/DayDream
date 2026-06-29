// src/core/helium/host/readingList/events.ts
//
// chrome.readingList.onEntryAdded / onEntryUpdated / onEntryRemoved
// event fan-out. Subscribes to ReadingListManager's change events and
// re-emits as Chrome-shape events to every extension with the
// `readingList` permission.

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
