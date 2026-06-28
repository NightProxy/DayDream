// src/core/helium/host/windows/events.ts
//
// chrome.windows.onFocusChanged emitted on window focus/blur. DDX is
// single-window so the only valid windowId is 1 (or WINDOW_ID_NONE
// = -1 on blur).

import type { ExtensionManager } from '@apis/extensions';

export function installWindowEventListeners(extMgr: ExtensionManager): () => void {
  const onFocus = (): void => {
    extMgr.fanoutEvent('chrome.windows.onFocusChanged', [1]);
  };
  const onBlur = (): void => {
    extMgr.fanoutEvent('chrome.windows.onFocusChanged', [-1]);
  };
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
  };
}
