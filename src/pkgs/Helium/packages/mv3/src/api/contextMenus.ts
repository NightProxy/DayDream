import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeContextMenus {
  public readonly onClicked: ChromeEvent = new ChromeEvent();

  create(...args: any[]): any {
    throw new Error('chrome.contextMenus.create is not implemented');
  }

  remove(...args: any[]): any {
    throw new Error('chrome.contextMenus.remove is not implemented');
  }

  removeAll(...args: any[]): any {
    throw new Error('chrome.contextMenus.removeAll is not implemented');
  }

  update(...args: any[]): any {
    throw new Error('chrome.contextMenus.update is not implemented');
  }

  static readonly ContextType = {
    ACTION: "action",
    ALL: "all",
    AUDIO: "audio",
    BROWSER_ACTION: "browser_action",
    EDITABLE: "editable",
    FRAME: "frame",
    IMAGE: "image",
    LAUNCHER: "launcher",
    LINK: "link",
    PAGE: "page",
    PAGE_ACTION: "page_action",
    SELECTION: "selection",
    VIDEO: "video",
  } as const;

  static readonly ItemType = {
    CHECKBOX: "checkbox",
    NORMAL: "normal",
    RADIO: "radio",
    SEPARATOR: "separator",
  } as const;

  static readonly ACTION_MENU_TOP_LEVEL_LIMIT: number = 6;
}
