
import type { ExtensionManager } from '@apis/extensions';

export function installDownloadsEventListeners(
  extMgr: ExtensionManager,
): () => void {
  let unsub: (() => void) | null = null;
  void import('@apis/downloads').then(({ DownloadsManager }) => {
    const mgr = DownloadsManager.getInstance();
    unsub = mgr.addChangeListener((event) => {
      switch (event.type) {
        case 'created':
          extMgr.fanoutEvent(
            'chrome.downloads.onCreated',
            [event.item],
            'downloads',
          );
          break;
        case 'changed':
          extMgr.fanoutEvent(
            'chrome.downloads.onChanged',
            [event.delta],
            'downloads',
          );
          break;
        case 'erased':
          extMgr.fanoutEvent(
            'chrome.downloads.onErased',
            [event.id],
            'downloads',
          );
          break;
      }
    });
  });
  return () => {
    if (unsub) {
      try { unsub(); } catch { /* swallow */ }
      unsub = null;
    }
  };
}
