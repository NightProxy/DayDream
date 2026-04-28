import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeTabs {
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

  captureVisibleTab(...args: any[]): any {
    throw new Error('chrome.tabs.captureVisibleTab is not implemented');
  }

  connect(...args: any[]): any {
    throw new Error('chrome.tabs.connect is not implemented');
  }

  create(...args: any[]): any {
    throw new Error('chrome.tabs.create is not implemented');
  }

  detectLanguage(...args: any[]): any {
    throw new Error('chrome.tabs.detectLanguage is not implemented');
  }

  discard(...args: any[]): any {
    throw new Error('chrome.tabs.discard is not implemented');
  }

  duplicate(...args: any[]): any {
    throw new Error('chrome.tabs.duplicate is not implemented');
  }

  get(...args: any[]): any {
    throw new Error('chrome.tabs.get is not implemented');
  }

  getCurrent(...args: any[]): any {
    throw new Error('chrome.tabs.getCurrent is not implemented');
  }

  getZoom(...args: any[]): any {
    throw new Error('chrome.tabs.getZoom is not implemented');
  }

  getZoomSettings(...args: any[]): any {
    throw new Error('chrome.tabs.getZoomSettings is not implemented');
  }

  goBack(...args: any[]): any {
    throw new Error('chrome.tabs.goBack is not implemented');
  }

  goForward(...args: any[]): any {
    throw new Error('chrome.tabs.goForward is not implemented');
  }

  group(...args: any[]): any {
    throw new Error('chrome.tabs.group is not implemented');
  }

  highlight(...args: any[]): any {
    throw new Error('chrome.tabs.highlight is not implemented');
  }

  move(...args: any[]): any {
    throw new Error('chrome.tabs.move is not implemented');
  }

  query(...args: any[]): any {
    throw new Error('chrome.tabs.query is not implemented');
  }

  reload(...args: any[]): any {
    throw new Error('chrome.tabs.reload is not implemented');
  }

  remove(...args: any[]): any {
    throw new Error('chrome.tabs.remove is not implemented');
  }

  sendMessage(...args: any[]): any {
    throw new Error('chrome.tabs.sendMessage is not implemented');
  }

  setZoom(...args: any[]): any {
    throw new Error('chrome.tabs.setZoom is not implemented');
  }

  setZoomSettings(...args: any[]): any {
    throw new Error('chrome.tabs.setZoomSettings is not implemented');
  }

  ungroup(...args: any[]): any {
    throw new Error('chrome.tabs.ungroup is not implemented');
  }

  update(...args: any[]): any {
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
