
import type { ExtensionManager } from '@apis/extensions';

/**
 * Synthesized chrome.windows.Window object. Sourced from the host
 * window's outer dimensions. Used by:
 *   - boot-time onCreated emit (so extensions that record window
 *     creation at install time see the host window appear)
 *   - onBoundsChanged on resize
 */
function buildWindowSnapshot(): {
  id: number;
  focused: boolean;
  alwaysOnTop: boolean;
  incognito: boolean;
  state: 'normal' | 'fullscreen' | 'maximized' | 'minimized';
  type: 'normal';
  top?: number;
  left?: number;
  width?: number;
  height?: number;
} {
  let w = 0, h = 0, top = 0, left = 0;
  try {
    w = window.outerWidth || window.innerWidth;
    h = window.outerHeight || window.innerHeight;
    top = window.screenY ?? 0;
    left = window.screenX ?? 0;
  } catch { /* swallow */ }
  return {
    id: 1,
    focused: typeof document !== 'undefined' ? document.hasFocus() : true,
    alwaysOnTop: false,
    incognito: false,
    state: 'normal',
    type: 'normal',
    top,
    left,
    width: w,
    height: h,
  };
}

export function installWindowEventListeners(extMgr: ExtensionManager): () => void {
  const onFocus = (): void => {
    extMgr.fanoutEvent('chrome.windows.onFocusChanged', [1]);
  };
  const onBlur = (): void => {
    extMgr.fanoutEvent('chrome.windows.onFocusChanged', [-1]);
  };

  let rafPending: number | null = null;
  const onResize = (): void => {
    if (rafPending != null) return;
    rafPending = requestAnimationFrame(() => {
      rafPending = null;
      extMgr.fanoutEvent('chrome.windows.onBoundsChanged', [buildWindowSnapshot()]);
    });
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);

  queueMicrotask(() => {
    extMgr.fanoutEvent('chrome.windows.onCreated', [buildWindowSnapshot()]);
  });

  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    if (rafPending != null) cancelAnimationFrame(rafPending);
  };
}
