
import type { ExtensionContext } from '../../extfs/types';
import { readExtensionFile, writeExtensionFile } from '../../extfs';
import type { IconSpec } from './icon';

interface ActionState {
  global: {
    title?: string;
    popup?: string;
    badgeText?: string;
    badgeBgColor?: string;
    badgeTextColor?: string;
    enabled?: boolean;
    iconPath?: IconSpec;
  };
  perTab: Record<number, Partial<ActionState['global']>>;
}

type GlobalKey = keyof ActionState['global'];

function defaultState(): ActionState {
  return { global: { enabled: true }, perTab: {} };
}

/**
 * Seed the global state from the manifest. Specifically honors:
 *   `action.default_state` (MV3) / `browser_action.default_state` (MV2)
 *      — 'enabled' (default) or 'disabled'
 *   `action.default_title` / `browser_action.default_title`
 *   `action.default_popup` / `browser_action.default_popup`
 *   `action.default_icon`  / `browser_action.default_icon`
 *
 * Real Chrome reads these at install time and the extension can then
 * mutate via setTitle/setPopup/setEnabled etc.
 */
function seedFromManifest(extId: string): ActionState {
  const state = defaultState();
  void extId;
  return state;
}

/**
 * Notifier fired whenever any per-extension action state changes
 * (title/popup/badge/icon/enabled/pageAction.show|hide). The
 * toolbar UI subscribes and re-renders the affected extension's
 * button. `tabId` is undefined when only the global state changed.
 */
export type ActionChangeListener = (extId: string, tabId?: number) => void;

export class ActionHandlers {
  private readonly states = new Map<string, ActionState>();
  private readonly loaded = new Set<string>();
  private readonly pageActionShown = new Map<string, Set<number>>();
  private readonly listeners = new Set<ActionChangeListener>();

  /**
   * Subscribe to action-state mutations. Listeners fire AFTER the
   * persisted state has been written. Returns an unsubscribe fn.
   */
  onChange(listener: ActionChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private fire(extId: string, tabId?: number): void {
    for (const l of this.listeners) {
      try { l(extId, tabId); } catch (err) { console.warn('[helium/action] listener threw:', err); }
    }
  }

  private async ensureLoaded(extId: string): Promise<void> {
    if (this.loaded.has(extId)) return;
    try {
      const bytes = await readExtensionFile(extId, '__helium_action__.json');
      const parsed = bytes
        ? (JSON.parse(new TextDecoder().decode(bytes)) as ActionState)
        : seedFromManifest(extId);
      this.states.set(extId, parsed);
    } catch {
      this.states.set(extId, seedFromManifest(extId));
    }
    this.loaded.add(extId);
  }

  /**
   * Called from ExtensionManager.spawn() after install. Seeds the
   * action state from manifest defaults (default_state /
   * default_title / default_popup / default_icon) for first-time
   * installs only — subsequent reloads preserve any state the
   * extension has set via its own API calls (which `ensureLoaded`
   * reads from the persisted file).
   *
   * `default_icon` accepts either a string or a size-keyed
   * Record<string, string> (e.g. `{16:"icon16.png", 48:"icon48.png"}`)
   * matching Chrome's manifest schema. Both forms are accepted as
   * `IconSpec` and persisted; the toolbar's `resolveIconPath` will
   * pick the best size at render time.
   */
  async seedFromManifest(
    extId: string,
    manifest: {
      action?: {
        default_state?: string;
        default_title?: string;
        default_popup?: string;
        default_icon?: string | Record<string, string>;
      };
      browser_action?: {
        default_state?: string;
        default_title?: string;
        default_popup?: string;
        default_icon?: string | Record<string, string>;
      };
    },
  ): Promise<void> {
    try {
      const existing = await readExtensionFile(extId, '__helium_action__.json');
      if (existing && existing.byteLength > 0) return;
    } catch { /* fall through to seed */ }

    const action = manifest.action ?? manifest.browser_action ?? {};
    const state = defaultState();
    if (action.default_state === 'disabled') {
      state.global.enabled = false;
    }
    if (typeof action.default_title === 'string') {
      state.global.title = action.default_title;
    }
    if (typeof action.default_popup === 'string') {
      state.global.popup = action.default_popup;
    }
    if (typeof action.default_icon === 'string') {
      state.global.iconPath = action.default_icon;
    } else if (action.default_icon && typeof action.default_icon === 'object') {
      state.global.iconPath = action.default_icon;
    }
    this.states.set(extId, state);
    this.loaded.add(extId);
    try { await this.persist(extId); } catch { /* noop */ }
    this.fire(extId);
  }

  private async persist(extId: string): Promise<void> {
    const state = this.states.get(extId) ?? defaultState();
    try {
      await writeExtensionFile(
        extId,
        '__helium_action__.json',
        new TextEncoder().encode(JSON.stringify(state)),
      );
    } catch (err) {
      console.warn('[helium/action] persist failed:', err);
    }
  }

  private getEffective<K extends GlobalKey>(
    extId: string,
    tabId: number | undefined,
    key: K,
  ): ActionState['global'][K] {
    const state = this.states.get(extId);
    if (!state) return undefined;
    if (tabId !== undefined) {
      const perTab = state.perTab[tabId];
      if (perTab && key in perTab) return perTab[key] as ActionState['global'][K];
    }
    return state.global[key];
  }

  private async assign<K extends GlobalKey>(
    extId: string,
    tabId: number | undefined,
    key: K,
    value: ActionState['global'][K],
  ): Promise<void> {
    await this.ensureLoaded(extId);
    const state = this.states.get(extId)!;
    if (tabId !== undefined) {
      if (!state.perTab[tabId]) state.perTab[tabId] = {};
      (state.perTab[tabId] as Record<string, unknown>)[key] = value;
    } else {
      (state.global as Record<string, unknown>)[key] = value;
    }
    await this.persist(extId);
    this.fire(extId, tabId);
  }

  setTitle = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { title?: string; tabId?: number };
    await this.assign(ctx.id, opts?.tabId, 'title', opts?.title ?? '');
  };
  getTitle = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    await this.ensureLoaded(ctx.id);
    return (this.getEffective(ctx.id, (args[0] as { tabId?: number } | undefined)?.tabId, 'title') ?? '') as string;
  };
  setPopup = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { popup?: string; tabId?: number };
    await this.assign(ctx.id, opts?.tabId, 'popup', opts?.popup ?? '');
  };
  getPopup = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    await this.ensureLoaded(ctx.id);
    return (this.getEffective(ctx.id, (args[0] as { tabId?: number } | undefined)?.tabId, 'popup') ?? '') as string;
  };
  setBadgeText = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { text?: string; tabId?: number };
    await this.assign(ctx.id, opts?.tabId, 'badgeText', opts?.text ?? '');
  };
  getBadgeText = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    await this.ensureLoaded(ctx.id);
    return (this.getEffective(ctx.id, (args[0] as { tabId?: number } | undefined)?.tabId, 'badgeText') ?? '') as string;
  };
  setBadgeBackgroundColor = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { color?: string | number[]; tabId?: number };
    const color = Array.isArray(opts?.color) ? `rgba(${opts.color.join(',')})` : (opts?.color ?? '');
    await this.assign(ctx.id, opts?.tabId, 'badgeBgColor', color);
  };
  getBadgeBackgroundColor = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    await this.ensureLoaded(ctx.id);
    return (this.getEffective(ctx.id, (args[0] as { tabId?: number } | undefined)?.tabId, 'badgeBgColor') ?? '#666') as string;
  };
  setBadgeTextColor = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { color?: string | number[]; tabId?: number };
    const color = Array.isArray(opts?.color) ? `rgba(${opts.color.join(',')})` : (opts?.color ?? '');
    await this.assign(ctx.id, opts?.tabId, 'badgeTextColor', color);
  };
  getBadgeTextColor = async (ctx: ExtensionContext, args: unknown[]): Promise<string> => {
    await this.ensureLoaded(ctx.id);
    return (this.getEffective(ctx.id, (args[0] as { tabId?: number } | undefined)?.tabId, 'badgeTextColor') ?? '#fff') as string;
  };
  setIcon = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const opts = args[0] as { imageData?: unknown; path?: IconSpec; tabId?: number };
    let iconValue: IconSpec | undefined = opts?.path;
    if (iconValue === undefined && opts?.imageData !== undefined) {
      iconValue = await imageDataToIconSpec(opts.imageData);
    }
    if (iconValue !== undefined) {
      await this.assign(ctx.id, opts?.tabId, 'iconPath', iconValue);
    }
  };
  enable = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    await this.assign(ctx.id, args[0] as number | undefined, 'enabled', true);
  };
  disable = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    await this.assign(ctx.id, args[0] as number | undefined, 'enabled', false);
  };
  isEnabled = async (ctx: ExtensionContext, args: unknown[]): Promise<boolean> => {
    await this.ensureLoaded(ctx.id);
    const v = this.getEffective(ctx.id, args[0] as number | undefined, 'enabled');
    return v !== false;
  };
  /**
   * `chrome.action.openPopup({windowId?, ...})` — programmatically
   * open the extension's action popup.
   *
   * Chrome's contract: requires a "user gesture" — clicking a
   * keyboard shortcut, accepting a permission prompt, etc. We can't
   * verify that from here, but we don't need to: the host menu's
   * popup-open path is already gated by the user opening the menu in
   * the first place. We allow programmatic open from BG; UI invariants
   * stay sane.
   *
   * The actual popup spawning is delegated to the host UI (which
   * owns popupHost / extension menu state) via the `openPopup`
   * callback wired by ExtensionManager.
   */
  openPopup = async (ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    const opener = (window as { extensions?: { openActionPopup?: (extId: string) => Promise<void> } }).extensions;
    if (opener?.openActionPopup) {
      await opener.openActionPopup(ctx.id);
      return;
    }
    throw new Error('chrome.action.openPopup: no host-side popup opener available');
  };
  getUserSettings = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => ({
    isOnToolbar: true,
  });

  pageActionShow = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const tabId = args[0] as number;
    let set = this.pageActionShown.get(ctx.id);
    if (!set) { set = new Set(); this.pageActionShown.set(ctx.id, set); }
    set.add(tabId);
    this.fire(ctx.id, tabId);
  };
  pageActionHide = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const tabId = args[0] as number;
    this.pageActionShown.get(ctx.id)?.delete(tabId);
    this.fire(ctx.id, tabId);
  };

  pageActionIsShown(extId: string, tabId: number): boolean {
    return this.pageActionShown.get(extId)?.has(tabId) === true;
  }

  getEffectiveSnapshot(extId: string, tabId?: number): ActionState['global'] {
    const state = this.states.get(extId) ?? defaultState();
    const perTab = tabId !== undefined ? state.perTab[tabId] : undefined;
    return { ...state.global, ...(perTab ?? {}) };
  }

  clearForExt(extId: string): void {
    this.states.delete(extId);
    this.loaded.delete(extId);
    this.pageActionShown.delete(extId);
    this.fire(extId);
  }
}

interface ImageDataLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

function isImageDataLike(v: unknown): v is ImageDataLike {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    (o.data instanceof Uint8ClampedArray || Array.isArray(o.data))
  );
}

async function imageDataToDataURL(
  raw: ImageDataLike,
): Promise<string | undefined> {
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('[helium/action] setIcon: OffscreenCanvas unavailable; dropping imageData');
      return undefined;
    }
    const canvas = new OffscreenCanvas(raw.width, raw.height);
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return undefined;
    const buf = new Uint8ClampedArray(
      raw.data instanceof Uint8ClampedArray
        ? raw.data
        : Uint8Array.from(raw.data),
    );
    const imageData = new ImageData(buf, raw.width, raw.height);
    ctx2d.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(String(fr.result));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[helium/action] setIcon imageData conversion failed:', err);
    return undefined;
  }
}

/**
 * Convert chrome.action.setIcon's `imageData` argument into an
 * IconSpec (string for a single size; Record<size, string> for the
 * multi-size form).
 *
 * Returns undefined if conversion fails or the shape is unrecognised.
 */
async function imageDataToIconSpec(
  imageData: unknown,
): Promise<IconSpec | undefined> {
  if (isImageDataLike(imageData)) {
    const url = await imageDataToDataURL(imageData);
    return url ? url : undefined;
  }
  if (imageData && typeof imageData === 'object') {
    const entries = Object.entries(imageData as Record<string, unknown>);
    const out: Record<string, string> = {};
    let anyOk = false;
    for (const [size, val] of entries) {
      if (!isImageDataLike(val)) continue;
      const url = await imageDataToDataURL(val);
      if (url) {
        out[size] = url;
        anyOk = true;
      }
    }
    return anyOk ? out : undefined;
  }
  return undefined;
}
