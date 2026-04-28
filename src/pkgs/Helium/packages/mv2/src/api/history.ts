import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeHistory {
  public readonly onVisitRemoved: ChromeEvent = new ChromeEvent();
  public readonly onVisited: ChromeEvent = new ChromeEvent();

  addUrl(...args: any[]): any {
    throw new Error('chrome.history.addUrl is not implemented');
  }

  deleteAll(...args: any[]): any {
    throw new Error('chrome.history.deleteAll is not implemented');
  }

  deleteRange(...args: any[]): any {
    throw new Error('chrome.history.deleteRange is not implemented');
  }

  deleteUrl(...args: any[]): any {
    throw new Error('chrome.history.deleteUrl is not implemented');
  }

  getVisits(...args: any[]): any {
    throw new Error('chrome.history.getVisits is not implemented');
  }

  search(...args: any[]): any {
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
