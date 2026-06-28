// src/core/helium/host/action/handlers.ts
//
// State methods for chrome.action.* / chrome.browserAction.* / chrome.pageAction.*.
//
// Per-extension state is persisted to `__helium_action__.json`. Per-tab
// overrides shadow the global value. UI integration is left to a future
// task (Task 25); these handlers only manage state + expose it via
// getEffectiveSnapshot().

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

export class ActionHandlers {
  private readonly states = new Map<string, ActionState>();
  private readonly loaded = new Set<string>();
  private readonly pageActionShown = new Map<string, Set<number>>();

  private async ensureLoaded(extId: string): Promise<void> {
    if (this.loaded.has(extId)) return;
    try {
      const bytes = await readExtensionFile(extId, '__helium_action__.json');
      const parsed = bytes
        ? (JSON.parse(new TextDecoder().decode(bytes)) as ActionState)
        : defaultState();
      this.states.set(extId, parsed);
    } catch {
      this.states.set(extId, defaultState());
    }
    this.loaded.add(extId);
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
  openPopup = async (_ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    throw new Error('chrome.action.openPopup requires user gesture');
  };
  getUserSettings = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => ({
    isOnToolbar: true,
  });

  // pageAction-specific:
  pageActionShow = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const tabId = args[0] as number;
    let set = this.pageActionShown.get(ctx.id);
    if (!set) { set = new Set(); this.pageActionShown.set(ctx.id, set); }
    set.add(tabId);
  };
  pageActionHide = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const tabId = args[0] as number;
    this.pageActionShown.get(ctx.id)?.delete(tabId);
  };

  // Helpers exposed to the toolbar UI (Task 25):
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
  }
}

// ----------------------------------------------------------------------
// chrome.action.setIcon imageData handling.
//
// Chrome's contract:
//   chrome.action.setIcon({ imageData: ImageData | { [size]: ImageData } })
// converts ImageData buffers to icon resources. We persist icons as a
// path string (URL) or a Record<size, path>, so we convert each
// ImageData to a data URL via OffscreenCanvas.
// ----------------------------------------------------------------------

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
    // ImageData's data arg is typed as `ImageDataArray` (an
    // ArrayBuffer-backed Uint8ClampedArray) — pass a fresh copy
    // backed by a plain ArrayBuffer so the type checker accepts it
    // regardless of how the caller allocated `raw.data`.
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
  // Single ImageData (Chrome's first overload).
  if (isImageDataLike(imageData)) {
    const url = await imageDataToDataURL(imageData);
    return url ? url : undefined;
  }
  // Multi-size record { '16': ImageData, '32': ImageData, ... }
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
