import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeWindows {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onBoundsChanged: ChromeEvent = new ChromeEvent();
  public readonly onFocusChanged: ChromeEvent = new ChromeEvent();
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  create(..._args: any[]): any {
    throw new Error('chrome.windows.create is not implemented');
  }

  get(..._args: any[]): any {
    throw new Error('chrome.windows.get is not implemented');
  }

  getAll(..._args: any[]): any {
    throw new Error('chrome.windows.getAll is not implemented');
  }

  getCurrent(..._args: any[]): any {
    throw new Error('chrome.windows.getCurrent is not implemented');
  }

  getLastFocused(..._args: any[]): any {
    throw new Error('chrome.windows.getLastFocused is not implemented');
  }

  remove(..._args: any[]): any {
    throw new Error('chrome.windows.remove is not implemented');
  }

  update(..._args: any[]): any {
    throw new Error('chrome.windows.update is not implemented');
  }

  static readonly CreateType = {
    NORMAL: "normal",
    PANEL: "panel",
    POPUP: "popup",
  } as const;

  static readonly WindowState = {
    FULLSCREEN: "fullscreen",
    LOCKED_FULLSCREEN: "locked-fullscreen",
    MAXIMIZED: "maximized",
    MINIMIZED: "minimized",
    NORMAL: "normal",
  } as const;

  static readonly WindowType = {
    APP: "app",
    DEVTOOLS: "devtools",
    NORMAL: "normal",
    PANEL: "panel",
    POPUP: "popup",
  } as const;

  static readonly WINDOW_ID_CURRENT: number = -2;
  static readonly WINDOW_ID_NONE: number = -1;
}
