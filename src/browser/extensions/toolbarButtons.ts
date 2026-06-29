/**
 * Per-extension toolbar buttons.
 *
 * Renders an icon button for each pinned browser-action extension AND
 * for each running extension whose pageAction is `show()`-n on the
 * active tab. Buttons live to the LEFT of the bookmark button inside
 * the urlbar-ring (so they read as belonging to "the active tab"
 * visually, matching Chrome's address-bar action area).
 *
 * Behavior per button:
 *   - Click with `default_popup` set → `openExtensionPopup` anchored
 *     to the button (the popup floats below it like a real browser).
 *   - Click with no popup → `extMgr.fireEventOn(extId, 'chrome.action.onClicked', [activeTabInfo])`
 *     for browserAction, or `'chrome.pageAction.onClicked'` for
 *     pageAction. (MV3 unifies on `chrome.action`; we fire both
 *     event names for compat — the BG will only have listeners for
 *     whichever API it declared.)
 *
 * Re-render triggers:
 *   - `tabSelected` (active tab change → per-tab snapshot may differ)
 *   - `ActionHandlers.onChange` (any setIcon/setTitle/setBadgeText/show/hide)
 *   - `ExtensionManager.on('installed'|'uninstalled'|'enabled'|'disabled')`
 *   - Pin set changes (toolbar polls SettingsAPI via a small cache;
 *     menuManager's setPinned writes invalidate via `markPinsDirty`)
 *
 * Cost: each render reads N extensions from `getRunning()` + per-ext
 * `getEffectiveSnapshot(extId, activeTabIdNum)` + per-ext icon URL.
 * Icons are resolved via `getIconDataUrl` and cached per `(extId, path)`
 * to avoid re-reading on every tab change.
 */

import { SettingsAPI } from '@apis/settings';
import { openExtensionPopup } from './popupHost';
import type { ExtensionContext } from '@core/helium';

const PIN_SETTINGS_KEY = 'pinnedExtensions';
const ICON_CACHE_LIMIT = 64; // small bound; far more than typical extension counts

interface ActionSnapshot {
  title?: string;
  popup?: string;
  badgeText?: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
  enabled?: boolean;
  iconPath?: unknown;
}

interface ExtensionInfo {
  id: string;
  ctx: {
    id: string;
    origin: string;
    manifest: Record<string, unknown>;
  };
}

interface ExtensionManagerLike {
  getRunning(): ExtensionInfo[];
  getIconDataUrl?: (extId: string, iconPath: string) => Promise<string | null>;
  fireEventOn?: (extId: string, method: string, args: unknown[]) => void;
  grantActiveTab?: (extId: string, tabId: number) => void;
  on?: (event: 'installed' | 'uninstalled' | 'enabled' | 'disabled', listener: (id: string) => void) => void;
  actionHandlers?: {
    getEffectiveSnapshot(extId: string, tabId?: number): ActionSnapshot;
    pageActionIsShown(extId: string, tabId: number): boolean;
    onChange?: (listener: (extId: string, tabId?: number) => void) => () => void;
  };
}

interface ManifestShape {
  name?: string;
  action?: { default_icon?: string | Record<string, string>; default_popup?: string };
  browser_action?: { default_icon?: string | Record<string, string>; default_popup?: string };
  page_action?: { default_icon?: string | Record<string, string>; default_popup?: string };
  icons?: Record<string, string>;
}

let prefsApi: SettingsAPI | null = null;
function getPrefsApi(): SettingsAPI {
  if (!prefsApi) prefsApi = new SettingsAPI('/data/extension-prefs.json', '/data');
  return prefsApi;
}

async function loadPinned(): Promise<Set<string>> {
  try {
    const raw = await getPrefsApi().getItem<string[]>(PIN_SETTINGS_KEY);
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

/**
 * Singleton toolbar controller. `install` mounts the slot container,
 * subscribes to lifecycle events, and starts rendering. Re-rendering
 * is debounced via a microtask to coalesce bursts (e.g. an extension
 * calling setTitle + setBadgeText + setIcon in succession).
 */
export class ExtensionToolbarButtons {
  private slot: HTMLElement | null = null;
  private dirty = false;
  private pinnedCache: Set<string> | null = null;
  private iconCache = new Map<string, string>();
  private unsubActions: (() => void) | null = null;
  private mounted = false;

  /**
   * Mount the toolbar's per-extension button slot. Idempotent. Looks
   * for the `urlbar-ring` container and inserts a `<div data-component="extension-toolbar-buttons">`
   * positioned to the LEFT of the bookmark button. If the urlbar-ring
   * isn't in the DOM yet, install() returns false; the caller should
   * retry on the next animation frame.
   */
  install(): boolean {
    if (this.mounted) return true;
    // DDX renders inside a Shadow DOM; `window.d` is the shadow root
    // (set in src/index.ts, used throughout @browser/items.ts etc.).
    // Falling back to document.querySelector finds nothing inside the
    // shadow, so the toolbar buttons would silently no-op.
    const shadow = (window as { d?: ShadowRoot | Document }).d ?? document;
    const root = shadow.querySelector('.urlbar-ring');
    if (!root) return false;

    const slot = document.createElement('div');
    slot.setAttribute('data-component', 'extension-toolbar-buttons');
    Object.assign(slot.style, {
      position: 'absolute',
      right: '6rem', // sits LEFT of bookmark (`right-[3.5rem]`) by ~2.5rem buffer
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      zIndex: '5', // below the menu dropdown (10000000) but above bg-2
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(slot);
    this.slot = slot;
    this.mounted = true;

    // Wire lifecycle hooks.
    this.bindEvents();
    this.scheduleRender();
    return true;
  }

  private bindEvents(): void {
    const extMgr = this.getExtMgr();

    // Re-render on tab activation (per-tab snapshot may differ).
    document.addEventListener('tabSelected', () => this.scheduleRender());

    // Re-render on action-state mutations.
    if (extMgr?.actionHandlers?.onChange) {
      this.unsubActions = extMgr.actionHandlers.onChange(() => this.scheduleRender());
    }

    // Re-render on install/uninstall/enable/disable.
    if (extMgr?.on) {
      const rerender = (): void => {
        this.pinnedCache = null;
        this.scheduleRender();
      };
      extMgr.on('installed', rerender);
      extMgr.on('uninstalled', rerender);
      extMgr.on('enabled', rerender);
      extMgr.on('disabled', rerender);
    }
  }

  /**
   * Drop the cached pin set — call when the user toggles a pin in the
   * extensions menu so the toolbar picks up the change immediately.
   */
  markPinsDirty(): void {
    this.pinnedCache = null;
    this.scheduleRender();
  }

  /** Force a render on the next microtask. Coalesces bursts. */
  private scheduleRender(): void {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      void this.render();
    });
  }

  private getExtMgr(): ExtensionManagerLike | undefined {
    return (window as { extensions?: ExtensionManagerLike }).extensions;
  }

  private async getActiveTabIdNum(): Promise<number | undefined> {
    const w = window as {
      tabs?: { activeTabId?: string | null };
      nyxBridge?: { tabResolver?: { toNum?: (id: string) => number } };
      nyx?: { tabResolver?: { toNum?: (id: string) => number } };
    };
    const activeId = w.tabs?.activeTabId ?? null;
    if (!activeId) return undefined;
    const toNum =
      w.nyxBridge?.tabResolver?.toNum ?? w.nyx?.tabResolver?.toNum;
    if (typeof toNum !== 'function') return undefined;
    try {
      return toNum(activeId);
    } catch {
      return undefined;
    }
  }

  private async render(): Promise<void> {
    if (!this.slot || !this.mounted) return;
    const extMgr = this.getExtMgr();
    if (!extMgr) {
      this.slot.innerHTML = '';
      return;
    }

    // Pinned set is small; cache to avoid re-reading on every render.
    if (this.pinnedCache === null) {
      this.pinnedCache = await loadPinned();
    }
    const pinned = this.pinnedCache;
    const running = extMgr.getRunning();
    const activeTabIdNum = await this.getActiveTabIdNum();

    // Decide which extensions get a toolbar button:
    //   - Browser-action: pinned AND has manifest.action / browser_action
    //   - Page-action: pageActionIsShown(extId, activeTabIdNum) == true
    type ButtonSpec = {
      ext: ExtensionInfo;
      manifest: ManifestShape;
      snap: ActionSnapshot;
      popup: string | null;
      iconPath: string | null;
      kind: 'action' | 'pageAction';
    };
    const buttons: ButtonSpec[] = [];
    for (const ext of running) {
      const manifest = ext.ctx.manifest as ManifestShape;
      const snap = extMgr.actionHandlers?.getEffectiveSnapshot(ext.id, activeTabIdNum) ?? {};
      const hasAction = !!(manifest.action || manifest.browser_action);
      const hasPageAction = !!manifest.page_action;
      const isPinned = pinned.has(ext.id);
      const isPageActionShown =
        activeTabIdNum !== undefined &&
        hasPageAction &&
        extMgr.actionHandlers?.pageActionIsShown(ext.id, activeTabIdNum) === true;

      if (hasAction && isPinned) {
        const popup =
          snap.popup ?? manifest.action?.default_popup ?? manifest.browser_action?.default_popup ?? null;
        const iconPath = resolveIconPath(manifest, snap.iconPath);
        buttons.push({ ext, manifest, snap, popup, iconPath, kind: 'action' });
      } else if (isPageActionShown) {
        const popup = snap.popup ?? manifest.page_action?.default_popup ?? null;
        const iconPath = resolveIconPath(manifest, snap.iconPath);
        buttons.push({ ext, manifest, snap, popup, iconPath, kind: 'pageAction' });
      }
    }

    // Render. Build fresh DOM each pass — cheap given typical N=0-3,
    // and avoids stale event listeners.
    this.slot.innerHTML = '';
    for (const spec of buttons) {
      this.slot.appendChild(this.buildButton(spec, activeTabIdNum));
    }
  }

  private buildButton(
    spec: {
      ext: ExtensionInfo;
      manifest: ManifestShape;
      snap: ActionSnapshot;
      popup: string | null;
      iconPath: string | null;
      kind: 'action' | 'pageAction';
    },
    activeTabIdNum: number | undefined,
  ): HTMLButtonElement {
    const { ext, manifest, snap, iconPath, kind } = spec;
    // `popup` is read by handleClick(spec) — destructured there.
    const btn = document.createElement('button');
    btn.setAttribute('data-action-ext-id', ext.id);
    btn.setAttribute('data-action-kind', kind);
    btn.setAttribute(
      'aria-label',
      snap.title ?? manifest.name ?? ext.id,
    );
    btn.title = snap.title ?? manifest.name ?? ext.id;
    Object.assign(btn.style, {
      position: 'relative',
      width: '28px',
      height: '28px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: snap.enabled === false ? 'not-allowed' : 'pointer',
      opacity: snap.enabled === false ? '0.5' : '1',
      padding: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--white-05, rgba(255,255,255,0.05))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });

    // Icon (with async data-URL resolution + cache).
    const iconWrap = document.createElement('div');
    Object.assign(iconWrap.style, {
      width: '18px',
      height: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    if (iconPath) {
      this.resolveIconUrl(ext.id, iconPath).then((url) => {
        if (!url) {
          iconWrap.appendChild(fallbackIcon());
          return;
        }
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        Object.assign(img.style, {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        } satisfies Partial<CSSStyleDeclaration>);
        img.onerror = () => {
          img.remove();
          iconWrap.appendChild(fallbackIcon());
        };
        iconWrap.appendChild(img);
      }).catch(() => {
        iconWrap.appendChild(fallbackIcon());
      });
    } else {
      iconWrap.appendChild(fallbackIcon());
    }
    btn.appendChild(iconWrap);

    // Badge overlay.
    if (snap.badgeText) {
      const badge = document.createElement('div');
      badge.textContent = snap.badgeText;
      Object.assign(badge.style, {
        position: 'absolute',
        bottom: '-1px',
        right: '-1px',
        background: snap.badgeBgColor || '#666',
        color: snap.badgeTextColor || '#fff',
        fontSize: '9px',
        fontWeight: '600',
        lineHeight: '1',
        padding: '1px 3px',
        borderRadius: '4px',
        minWidth: '12px',
        textAlign: 'center',
        border: '1.5px solid var(--bg, #1a1a1a)',
        pointerEvents: 'none',
      } satisfies Partial<CSSStyleDeclaration>);
      btn.appendChild(badge);
    }

    // Click handler.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (snap.enabled === false) return;
      this.handleClick(spec, activeTabIdNum, btn);
    });

    return btn;
  }

  private async resolveIconUrl(extId: string, iconPath: string): Promise<string | null> {
    const key = `${extId}|${iconPath}`;
    const cached = this.iconCache.get(key);
    if (cached) return cached;
    const extMgr = this.getExtMgr();
    if (!extMgr?.getIconDataUrl) return null;
    try {
      const url = await extMgr.getIconDataUrl(extId, iconPath);
      if (url) {
        // Bound cache so a runaway setIcon loop doesn't blow up memory.
        if (this.iconCache.size > ICON_CACHE_LIMIT) {
          const firstKey = this.iconCache.keys().next().value;
          if (firstKey) this.iconCache.delete(firstKey);
        }
        this.iconCache.set(key, url);
      }
      return url ?? null;
    } catch (err) {
      console.warn('[extensionToolbar] icon resolve failed:', err);
      return null;
    }
  }

  private handleClick(
    spec: {
      ext: ExtensionInfo;
      popup: string | null;
      kind: 'action' | 'pageAction';
    },
    activeTabIdNum: number | undefined,
    anchorEl: HTMLElement,
  ): void {
    const extMgr = this.getExtMgr();
    if (!extMgr) return;

    // Grant activeTab for the current tab so the click counts as a
    // user-gesture activation (mirrors menuManager.onExtensionRowClick).
    if (activeTabIdNum !== undefined && extMgr.grantActiveTab) {
      try { extMgr.grantActiveTab(spec.ext.id, activeTabIdNum); } catch (err) { console.warn(err); }
    }

    if (spec.popup) {
      try {
        openExtensionPopup({
          extId: spec.ext.id,
          ctx: spec.ext.ctx as unknown as ExtensionContext,
          popupPath: spec.popup,
          anchorEl,
        });
      } catch (err) {
        console.warn('[extensionToolbar] openExtensionPopup failed:', err);
      }
      return;
    }

    // No popup — fire the appropriate onClicked event with the
    // active tab info. browserAction uses `chrome.action.onClicked`
    // (MV3 unified) or `chrome.browserAction.onClicked` (MV2); we
    // fire BOTH so listeners on either path receive it. pageAction
    // uses `chrome.pageAction.onClicked`.
    let tabInfo: unknown;
    const w = window as {
      nyxBridge?: { tabResolver?: { info?: (n: number) => unknown } };
      nyx?: { tabResolver?: { info?: (n: number) => unknown } };
    };
    const info = w.nyxBridge?.tabResolver?.info ?? w.nyx?.tabResolver?.info;
    if (activeTabIdNum !== undefined && typeof info === 'function') {
      try { tabInfo = info(activeTabIdNum); } catch { /* swallow */ }
    }

    try {
      if (spec.kind === 'pageAction') {
        extMgr.fireEventOn?.(spec.ext.id, 'chrome.pageAction.onClicked', [tabInfo]);
      } else {
        extMgr.fireEventOn?.(spec.ext.id, 'chrome.action.onClicked', [tabInfo]);
        extMgr.fireEventOn?.(spec.ext.id, 'chrome.browserAction.onClicked', [tabInfo]);
      }
    } catch (err) {
      console.warn('[extensionToolbar] fireEventOn failed:', err);
    }
  }

  /** Teardown (mostly for tests). */
  uninstall(): void {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.unsubActions) {
      try { this.unsubActions(); } catch { /* noop */ }
      this.unsubActions = null;
    }
    this.slot?.remove();
    this.slot = null;
    this.iconCache.clear();
  }
}

function resolveIconPath(manifest: ManifestShape, override: unknown): string | null {
  if (typeof override === 'string') return override;
  if (override && typeof override === 'object') {
    return pickFromIconMap(override as Record<string, string>);
  }
  const a =
    manifest.action?.default_icon ??
    manifest.browser_action?.default_icon ??
    manifest.page_action?.default_icon;
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object') return pickFromIconMap(a);
  if (manifest.icons) return pickFromIconMap(manifest.icons);
  return null;
}

function pickFromIconMap(map: Record<string, string>): string | null {
  // Prefer 16/32 for toolbar — actual rendered size is 18px.
  for (const size of ['32', '24', '16', '48', '64', '128']) {
    const v = map[size];
    if (typeof v === 'string') return v;
  }
  const first = Object.values(map).find((v) => typeof v === 'string');
  return first ?? null;
}

function fallbackIcon(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.color = 'var(--text, rgba(255,255,255,0.8))';
  svg.style.opacity = '0.7';
  const path = document.createElementNS(ns, 'path');
  // A simplified "puzzle piece" outline.
  path.setAttribute(
    'd',
    'M19 7.85c-.05.32.06.65.29.88l1.57 1.57c.47.47.7 1.09.7 1.7s-.23 1.23-.7 1.7l-1.61 1.61a.98.98 0 0 1-.84.28c-.47-.07-.8-.48-.97-.93a2.5 2.5 0 1 0-3.21 3.22c.45.16.85.5.92.96a.98.98 0 0 1-.28.84l-1.61 1.61c-.47.47-1.09.7-1.7.7-.62 0-1.24-.24-1.71-.71l-1.57-1.57a1.03 1.03 0 0 0-.88-.29c-.49.07-.84.5-1.02.97a2.5 2.5 0 1 1-3.24-3.24c.46-.18.9-.53.97-1.02a1.03 1.03 0 0 0-.29-.88L2.7 14.32a2.4 2.4 0 0 1-.7-1.71c0-.62.23-1.24.7-1.71L4.23 9.4c.24-.24.58-.36.92-.31.51.08.88.53 1.07 1.01a2.5 2.5 0 1 0 3.26-3.26c-.48-.2-.93-.56-1.01-1.07-.05-.34.06-.68.3-.92l1.53-1.52A2.4 2.4 0 0 1 12 2c.62 0 1.24.24 1.7.71l1.57 1.57c.23.23.56.34.88.29.49-.07.84-.5 1.02-.97a2.5 2.5 0 1 1 3.24 3.24c-.46.18-.9.53-.97 1.02Z',
  );
  svg.appendChild(path);
  return svg;
}
