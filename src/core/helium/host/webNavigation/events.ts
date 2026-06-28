// src/core/helium/host/webNavigation/events.ts

import type { ExtensionManager } from '@apis/extensions';

export function installWebNavigationEventListeners(
  extMgr: ExtensionManager,
  tabResolver: { toNum: (id: string) => number },
): () => void {
  // Per-tab URL memory for SPA navigation detection. SPA = same
  // pathname, different hash or query — Chrome distinguishes
  // history-state updates (pushState/replaceState) from
  // reference-fragment updates (#hash) from full document loads.
  // We can't see the script-level API call that triggered the change
  // (we'd need to instrument the page), so we approximate by URL diff.
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
        // SPA-style URL change (history.pushState / replaceState /
        // anchor click into a fragment). Compare with previous URL
        // for this tab to decide which specialized event to fire.
        const prev = lastUrlPerTab.get(num);
        lastUrlPerTab.set(num, detail.url);

        // Always fire onCommitted (matches existing behavior + Chrome).
        extMgr.fanoutEvent(
          'chrome.webNavigation.onCommitted',
          [{ ...base, transitionType: 'link', transitionQualifiers: [] }],
          'webNavigation',
        );

        // Specialized SPA events. Only fired when:
        //   - The phase change came from URL-change detection
        //     (`fromUrlChange: true`), not the protocols.navigate path.
        //   - There's a previous URL to compare against.
        //   - The URLs differ in fragment OR query only — same path
        //     + scheme. Otherwise it's a "real" navigation and only
        //     onCommitted is appropriate.
        if (detail.fromUrlChange && prev && prev !== detail.url) {
          try {
            const a = new URL(prev);
            const b = new URL(detail.url);
            const samePath = a.origin === b.origin && a.pathname === b.pathname;
            if (samePath) {
              if (a.hash !== b.hash && a.search === b.search) {
                // Pure fragment change.
                extMgr.fanoutEvent(
                  'chrome.webNavigation.onReferenceFragmentUpdated',
                  [{ ...base, transitionType: 'link', transitionQualifiers: ['client_redirect'] }],
                  'webNavigation',
                );
              } else {
                // Different query or both query+hash — history state
                // update (pushState/replaceState semantics).
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

        // Phase 4 (Task 32): also fan out to chrome.devtools.network.onNavigated
        // for extensions whose devtools_page is open on this tab.
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
