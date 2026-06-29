import type { ExtensionContext } from '../../extfs/types';
import { DeclarativeEvent } from '..';

export class ChromeDeclarativeContent {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onPageChanged: DeclarativeEvent = new DeclarativeEvent();

  /**
   * `chrome.declarativeContent.*` — declarative page-state matching
   * for showing/hiding the page action.
   *
   * Constructors return tagged objects carrying their conditions /
   * actions. `onPageChanged.addRules(...)` is overlaid via the
   * bootstrap's RPC bindings, which relay rules to the host's
   * `DeclarativeContentHandlers` (`src/core/helium/host/declarativeContent/`).
   * The host then evaluates rules on every tabNavigated / tabSelected
   * and applies actions (ShowAction → pageAction.show, SetIcon → setIcon).
   *
   * Spreading `args[0]` into the returned object lets PageStateMatcher
   * carry `pageUrl` and `css` directly on the tagged shape — that's
   * how the host matcher reads them.
   */
  PageStateMatcher(...args: any[]): { instanceType: string; pageUrl?: unknown; css?: unknown; conditions: unknown[] } {
    const first = (args[0] ?? {}) as { pageUrl?: unknown; css?: unknown };
    return {
      instanceType: 'declarativeContent.PageStateMatcher',
      pageUrl: first.pageUrl,
      css: first.css,
      conditions: args,
    };
  }

  ShowAction(...args: any[]): { instanceType: string; args: unknown[] } {
    return { instanceType: 'declarativeContent.ShowAction', args };
  }

  ShowPageAction(...args: any[]): { instanceType: string; args: unknown[] } {
    return { instanceType: 'declarativeContent.ShowPageAction', args };
  }

  RequestContentScript(...args: any[]): { instanceType: string; args: unknown[] } {
    return { instanceType: 'declarativeContent.RequestContentScript', args };
  }

  /**
   * Set a per-tab icon when the rule matches. `args[0]` carries the
   * imageData (single ImageData OR `{16:..., 32:...}` Record), same
   * shape as `chrome.action.setIcon({imageData})`.
   */
  SetIcon(...args: any[]): { instanceType: string; imageData?: unknown; args: unknown[] } {
    const first = (args[0] ?? {}) as { imageData?: unknown };
    return {
      instanceType: 'declarativeContent.SetIcon',
      imageData: first.imageData,
      args,
    };
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
