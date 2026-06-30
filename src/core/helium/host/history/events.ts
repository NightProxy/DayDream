
import type { ExtensionManager } from '@apis/extensions';
import { HistoryManager, type HistoryEntry } from '@apis/history';

function toChromeItem(entry: HistoryEntry): unknown {
  return {
    id: entry.id,
    url: entry.url,
    title: entry.title,
    lastVisitTime: entry.visitedAt.getTime(),
    visitCount: entry.visitCount,
    typedCount: 0,
  };
}

export function installHistoryEventListeners(extMgr: ExtensionManager): () => void {
  const mgr = HistoryManager.getInstance();
  return mgr.addChangeListener((event) => {
    if (event.type === 'visited') {
      extMgr.fanoutEvent('chrome.history.onVisited', [toChromeItem(event.item)], 'history');
    } else if (event.type === 'removed') {
      extMgr.fanoutEvent('chrome.history.onVisitRemoved', [event.info], 'history');
    }
  });
}
