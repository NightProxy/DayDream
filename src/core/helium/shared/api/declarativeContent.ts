import type { ExtensionContext } from '../../extfs/types';
import { DeclarativeEvent } from '..';

export class ChromeDeclarativeContent {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onPageChanged: DeclarativeEvent = new DeclarativeEvent();

  PageStateMatcher(..._args: any[]): any {
    throw new Error('chrome.declarativeContent.PageStateMatcher is not implemented');
  }

  ShowAction(..._args: any[]): any {
    throw new Error('chrome.declarativeContent.ShowAction is not implemented');
  }

  ShowPageAction(..._args: any[]): any {
    throw new Error('chrome.declarativeContent.ShowPageAction is not implemented');
  }

  RequestContentScript(..._args: any[]): any {
    throw new Error('chrome.declarativeContent.RequestContentScript is not implemented');
  }

  static readonly PageStateMatcherInstanceType = {
    'DECLARATIVE_CONTENT.PAGE_STATE_MATCHER': "declarativeContent.PageStateMatcher",
  } as const;

  static readonly RequestContentScriptInstanceType = {
    'DECLARATIVE_CONTENT.REQUEST_CONTENT_SCRIPT': "declarativeContent.RequestContentScript",
  } as const;

  static readonly SetIconInstanceType = {
    'DECLARATIVE_CONTENT.SET_ICON': "declarativeContent.SetIcon",
  } as const;

  static readonly ShowActionInstanceType = {
    'DECLARATIVE_CONTENT.SHOW_ACTION': "declarativeContent.ShowAction",
  } as const;

  static readonly ShowPageActionInstanceType = {
    'DECLARATIVE_CONTENT.SHOW_PAGE_ACTION': "declarativeContent.ShowPageAction",
  } as const;

}
