import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../../shared';

export class ChromeTabGroups {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onMoved: ChromeEvent = new ChromeEvent();
  public readonly onUpdated: ChromeEvent = new ChromeEvent();
  public readonly onCreated: ChromeEvent = new ChromeEvent();

  get(..._args: any[]): any {
    throw new Error('chrome.tabGroups.get is not implemented');
  }

  move(..._args: any[]): any {
    throw new Error('chrome.tabGroups.move is not implemented');
  }

  query(..._args: any[]): any {
    throw new Error('chrome.tabGroups.query is not implemented');
  }

  update(..._args: any[]): any {
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
