import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeWebNavigation {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onHistoryStateUpdated: ChromeEvent = new ChromeEvent();
  public readonly onTabReplaced: ChromeEvent = new ChromeEvent();
  public readonly onReferenceFragmentUpdated: ChromeEvent = new ChromeEvent();
  public readonly onCreatedNavigationTarget: ChromeEvent = new ChromeEvent();
  public readonly onErrorOccurred: ChromeEvent = new ChromeEvent();
  public readonly onCompleted: ChromeEvent = new ChromeEvent();
  public readonly onDOMContentLoaded: ChromeEvent = new ChromeEvent();
  public readonly onCommitted: ChromeEvent = new ChromeEvent();
  public readonly onBeforeNavigate: ChromeEvent = new ChromeEvent();

  getAllFrames(..._args: any[]): any {
    throw new Error('chrome.webNavigation.getAllFrames is not implemented');
  }

  getFrame(..._args: any[]): any {
    throw new Error('chrome.webNavigation.getFrame is not implemented');
  }

  static readonly TransitionQualifier = {
    CLIENT_REDIRECT: "client_redirect",
    FORWARD_BACK: "forward_back",
    FROM_ADDRESS_BAR: "from_address_bar",
    SERVER_REDIRECT: "server_redirect",
  } as const;

  static readonly TransitionType = {
    AUTO_BOOKMARK: "auto_bookmark",
    AUTO_SUBFRAME: "auto_subframe",
    FORM_SUBMIT: "form_submit",
    GENERATED: "generated",
    KEYWORD: "keyword",
    KEYWORD_GENERATED: "keyword_generated",
    LINK: "link",
    MANUAL_SUBFRAME: "manual_subframe",
    RELOAD: "reload",
    START_PAGE: "start_page",
    TYPED: "typed",
  } as const;

}
