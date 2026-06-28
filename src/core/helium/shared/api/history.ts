import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeHistory {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onVisitRemoved: ChromeEvent = new ChromeEvent();
  public readonly onVisited: ChromeEvent = new ChromeEvent();

  addUrl(..._args: any[]): any {
    throw new Error('chrome.history.addUrl is not implemented');
  }

  deleteAll(..._args: any[]): any {
    throw new Error('chrome.history.deleteAll is not implemented');
  }

  deleteRange(..._args: any[]): any {
    throw new Error('chrome.history.deleteRange is not implemented');
  }

  deleteUrl(..._args: any[]): any {
    throw new Error('chrome.history.deleteUrl is not implemented');
  }

  getVisits(..._args: any[]): any {
    throw new Error('chrome.history.getVisits is not implemented');
  }

  search(..._args: any[]): any {
    throw new Error('chrome.history.search is not implemented');
  }

  static readonly TransitionType = {
    AUTO_BOOKMARK: "auto_bookmark",
    AUTO_SUBFRAME: "auto_subframe",
    AUTO_TOPLEVEL: "auto_toplevel",
    FORM_SUBMIT: "form_submit",
    GENERATED: "generated",
    KEYWORD: "keyword",
    KEYWORD_GENERATED: "keyword_generated",
    LINK: "link",
    MANUAL_SUBFRAME: "manual_subframe",
    RELOAD: "reload",
    TYPED: "typed",
  } as const;

}
