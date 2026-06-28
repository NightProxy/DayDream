// src/core/helium/host/tabs/events.ts
//
// Listens to the DDX tabCreated/tabClosed/tabSelected/tabMetaChanged/
// tabMoved CustomEvents and fans them out to all extensions with the
// `tabs` permission as chrome.tabs.onCreated/onRemoved/onActivated/
// onUpdated/onMoved.

import type { ExtensionManager } from '@apis/extensions';
import type { TabInfo } from '@apis/nyxBridge/api';

export interface TabEventDeps {
  extMgr: ExtensionManager;
  tabResolver: {
    toNum: (id: string) => number;
    info: (n: number) => TabInfo;
  };
}

export function installTabEventListeners(deps: TabEventDeps): () => void {
  const { extMgr, tabResolver } = deps;

  const safeNum = (id: string | undefined): number | null => {
    if (!id) return null;
    try { return tabResolver.toNum(id); } catch { return null; }
  };
  const safeInfo = (n: number): TabInfo | null => {
    try { return tabResolver.info(n); } catch { return null; }
  };

  const onCreated = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { tabId?: string } | undefined;
    const num = safeNum(detail?.tabId);
    if (num === null) return;
    const info = safeInfo(num);
    if (!info) return;
    extMgr.fanoutEvent('chrome.tabs.onCreated', [info], 'tabs');
  };

  const onClosed = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { tabId?: string } | undefined;
    const num = safeNum(detail?.tabId);
    if (num === null) return;
    extMgr.fanoutEvent('chrome.tabs.onRemoved', [num, { windowId: 1, isWindowClosing: false }], 'tabs');
  };

  const onSelected = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { tabId?: string } | undefined;
    const num = safeNum(detail?.tabId);
    if (num === null) return;
    extMgr.fanoutEvent('chrome.tabs.onActivated', [{ tabId: num, windowId: 1 }], 'tabs');
  };

  const onMeta = (e: Event): void => {
    const detail = (e as CustomEvent).detail as
      | { tabId?: string; changes?: Record<string, unknown> }
      | undefined;
    if (!detail?.changes) return;
    const num = safeNum(detail.tabId);
    if (num === null) return;
    const info = safeInfo(num);
    if (!info) return;
    const changeInfo = { ...detail.changes, status: info.status ?? 'complete' };
    extMgr.fanoutEvent('chrome.tabs.onUpdated', [num, changeInfo, info], 'tabs');
  };

  const onMoved = (e: Event): void => {
    const detail = (e as CustomEvent).detail as
      | { tabId?: string; fromIndex?: number; toIndex?: number }
      | undefined;
    if (!detail || detail.fromIndex === undefined || detail.toIndex === undefined) return;
    const num = safeNum(detail.tabId);
    if (num === null) return;
    extMgr.fanoutEvent(
      'chrome.tabs.onMoved',
      [num, { fromIndex: detail.fromIndex, toIndex: detail.toIndex, windowId: 1 }],
      'tabs',
    );
  };

  document.addEventListener('tabCreated', onCreated);
  document.addEventListener('tabClosed', onClosed);
  document.addEventListener('tabSelected', onSelected);
  document.addEventListener('tabMetaChanged', onMeta);
  document.addEventListener('tabMoved', onMoved);

  return () => {
    document.removeEventListener('tabCreated', onCreated);
    document.removeEventListener('tabClosed', onClosed);
    document.removeEventListener('tabSelected', onSelected);
    document.removeEventListener('tabMetaChanged', onMeta);
    document.removeEventListener('tabMoved', onMoved);
  };
}
