// src/core/helium/host/downloads/events.ts
//
// chrome.downloads.onCreated / onChanged / onErased fan-out.
// Subscribes to DownloadsManager's change events and re-emits as
// Chrome-shape events. Extensions with the `downloads` permission
// receive them.

import type { ExtensionManager } from '@apis/extensions';

export function installDownloadsEventListeners(
  extMgr: ExtensionManager,
): () => void {
  // Use dynamic import to keep the host bundle lean. The returned
  // teardown is wired up synchronously even if the import is still
  // in flight — the unsubscribe is captured once it resolves.
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
