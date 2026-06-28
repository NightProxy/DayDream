import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

export class ChromeTabsBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onZoomChange: ChromeEvent = new ChromeEvent();
  public readonly onReplaced: ChromeEvent = new ChromeEvent();
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onAttached: ChromeEvent = new ChromeEvent();
  public readonly onDetached: ChromeEvent = new ChromeEvent();
  public readonly onHighlighted: ChromeEvent = new ChromeEvent();
  public readonly onActivated: ChromeEvent = new ChromeEvent();
  public readonly onMoved: ChromeEvent = new ChromeEvent();
  public readonly onUpdated: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  captureVisibleTab(..._args: any[]): any {
    throw new Error('chrome.tabs.captureVisibleTab is not implemented');
  }
  connect(..._args: any[]): any {
    throw new Error('chrome.tabs.connect is not implemented');
  }
  create(..._args: any[]): any {
    throw new Error('chrome.tabs.create is not implemented');
  }
  detectLanguage(..._args: any[]): any {
    throw new Error('chrome.tabs.detectLanguage is not implemented');
  }
  discard(..._args: any[]): any {
    throw new Error('chrome.tabs.discard is not implemented');
  }
  duplicate(..._args: any[]): any {
    throw new Error('chrome.tabs.duplicate is not implemented');
  }
  get(..._args: any[]): any {
    throw new Error('chrome.tabs.get is not implemented');
  }
  getCurrent(..._args: any[]): any {
    throw new Error('chrome.tabs.getCurrent is not implemented');
  }
  getZoom(..._args: any[]): any {
    throw new Error('chrome.tabs.getZoom is not implemented');
  }
  getZoomSettings(..._args: any[]): any {
    throw new Error('chrome.tabs.getZoomSettings is not implemented');
  }
  goBack(..._args: any[]): any {
    throw new Error('chrome.tabs.goBack is not implemented');
  }
  goForward(..._args: any[]): any {
    throw new Error('chrome.tabs.goForward is not implemented');
  }
  group(..._args: any[]): any {
    throw new Error('chrome.tabs.group is not implemented');
  }
  highlight(..._args: any[]): any {
    throw new Error('chrome.tabs.highlight is not implemented');
  }
  move(..._args: any[]): any {
    throw new Error('chrome.tabs.move is not implemented');
  }
  query(..._args: any[]): any {
    throw new Error('chrome.tabs.query is not implemented');
  }
  reload(..._args: any[]): any {
    throw new Error('chrome.tabs.reload is not implemented');
  }
  remove(..._args: any[]): any {
    throw new Error('chrome.tabs.remove is not implemented');
  }
  sendMessage(..._args: any[]): any {
    throw new Error('chrome.tabs.sendMessage is not implemented');
  }
  setZoom(..._args: any[]): any {
    throw new Error('chrome.tabs.setZoom is not implemented');
  }
  setZoomSettings(..._args: any[]): any {
    throw new Error('chrome.tabs.setZoomSettings is not implemented');
  }
  ungroup(..._args: any[]): any {
    throw new Error('chrome.tabs.ungroup is not implemented');
  }
  update(..._args: any[]): any {
    throw new Error('chrome.tabs.update is not implemented');
  }

  static readonly MutedInfoReason = {
    CAPTURE: "capture",
    EXTENSION: "extension",
    USER: "user",
  } as const;

  static readonly TabStatus = {
    COMPLETE: "complete",
    LOADING: "loading",
    UNLOADED: "unloaded",
  } as const;

  static readonly WindowType = {
    APP: "app",
    DEVTOOLS: "devtools",
    NORMAL: "normal",
    PANEL: "panel",
    POPUP: "popup",
  } as const;

  static readonly ZoomSettingsMode = {
    AUTOMATIC: "automatic",
    DISABLED: "disabled",
    MANUAL: "manual",
  } as const;

  static readonly ZoomSettingsScope = {
    PER_ORIGIN: "per-origin",
    PER_TAB: "per-tab",
  } as const;

  static readonly MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: number = 2;
  static readonly SPLIT_VIEW_ID_NONE: number = -1;
  static readonly TAB_ID_NONE: number = -1;
  static readonly TAB_INDEX_NONE: number = -1;
}
