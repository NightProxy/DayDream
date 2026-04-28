import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeTabGroups {
  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onMoved: ChromeEvent = new ChromeEvent();
  public readonly onUpdated: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  get(...args: any[]): any {
    throw new Error('chrome.tabGroups.get is not implemented');
  }

  move(...args: any[]): any {
    throw new Error('chrome.tabGroups.move is not implemented');
  }

  query(...args: any[]): any {
    throw new Error('chrome.tabGroups.query is not implemented');
  }

  update(...args: any[]): any {
    throw new Error('chrome.tabGroups.update is not implemented');
  }

  static readonly Color = {
    BLUE: "blue",
    CYAN: "cyan",
    GREEN: "green",
    GREY: "grey",
    ORANGE: "orange",
    PINK: "pink",
    PURPLE: "purple",
    RED: "red",
    YELLOW: "yellow",
  } as const;

  static readonly TAB_GROUP_ID_NONE: number = -1;
}
