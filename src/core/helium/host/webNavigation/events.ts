
import type { ExtensionManager } from '@apis/extensions';

export function installWebNavigationEventListeners(
  extMgr: ExtensionManager,
  tabResolver: { toNum: (id: string) => number },
): () => void {
  const lastUrlPerTab = new Map<number, string>();

  const listener = (e: Event): void => {
    const detail = (e as CustomEvent).detail as
      | { tabId?: string; url?: string; phase?: string; fromUrlChange?: boolean }
      | undefined;
    if (!detail?.tabId || !detail.url) return;
    let num: number;
    try { num = tabResolver.toNum(detail.tabId); } catch { return; }
    const base = {
      tabId: num,
      frameId: 0,
      parentFrameId: -1,
      processId: 0,
      url: detail.url,
      timeStamp: Date.now(),
    };
    switch (detail.phase) {
      case 'before':
        extMgr.fanoutEvent('chrome.webNavigation.onBeforeNavigate', [base], 'webNavigation');
        break;
      case 'committed': {
        const prev = lastUrlPerTab.get(num);
        lastUrlPerTab.set(num, detail.url);

        extMgr.fanoutEvent(
          'chrome.webNavigation.onCommitted',
          [{ ...base, transitionType: 'link', transitionQualifiers: [] }],
          'webNavigation',
        );

        if (detail.fromUrlChange && prev && prev !== detail.url) {
          try {
            const a = new URL(prev);
            const b = new URL(detail.url);
            const samePath = a.origin === b.origin && a.pathname === b.pathname;
            if (samePath) {
              if (a.hash !== b.hash && a.search === b.search) {
                extMgr.fanoutEvent(
                  'chrome.webNavigation.onReferenceFragmentUpdated',
                  [{ ...base, transitionType: 'link', transitionQualifiers: ['client_redirect'] }],
                  'webNavigation',
                );
              } else {
                extMgr.fanoutEvent(
                  'chrome.webNavigation.onHistoryStateUpdated',
                  [{ ...base, transitionType: 'link', transitionQualifiers: ['client_redirect'] }],
                  'webNavigation',
                );
              }
            }
          } catch {
            // URL parse failed — skip the specialized event but
            // we've already fired onCommitted above.
          }
        }

        try {
          extMgr.getDevtoolsHandlers()?.onWebNavigationCommitted(num, detail.url);
        } catch (err) {
          console.warn('[helium/webNavigation] devtools fan-out failed:', err);
        }
        break;
      }
      case 'dom-content-loaded':
        extMgr.fanoutEvent('chrome.webNavigation.onDOMContentLoaded', [base], 'webNavigation');
        break;
      case 'completed':
        extMgr.fanoutEvent('chrome.webNavigation.onCompleted', [base], 'webNavigation');
        break;
      case 'error':
        extMgr.fanoutEvent(
          'chrome.webNavigation.onErrorOccurred',
          [{ ...base, error: 'unknown' }],
          'webNavigation',
        );
        break;
    }
  };
  document.addEventListener('tabNavigated', listener);
  return () => document.removeEventListener('tabNavigated', listener);
}
