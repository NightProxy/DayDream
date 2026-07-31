import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

/**
 * `chrome.menus` — Firefox WebExtension-compatible alias for
 * `chrome.contextMenus`. Some cross-browser extensions feature-
 * detect with `chrome.menus ?? chrome.contextMenus`; this class
 * makes the alias resolve. Host handlers for both `chrome.menus.*`
 * and `chrome.contextMenus.*` are bound in `handlerImpls` and
 * `RPC_BINDINGS` (see `src/apis/extensions.ts` and
 * `src/core/helium/bootstrap/client.ts`).
 *
 * Methods are throw-stubs at construction time; overlaid by
 * `installRpcBindings` post-handshake.
 *
 * The mirrored surface is intentionally narrow — only the methods
 * Firefox exposes on `chrome.menus` and that DDX has host handlers
 * for. Firefox-only events (`onShown`, `onHidden`) are declared
 * here but never fire (event-decl-only).
 */
export class ChromeMenus {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onClicked: ChromeEvent = new ChromeEvent();
  public readonly onShown: ChromeEvent = new ChromeEvent();
  public readonly onHidden: ChromeEvent = new ChromeEvent();

  create(..._args: any[]): any {
    throw new Error('chrome.menus.create is not implemented');
  }

  update(..._args: any[]): any {
    throw new Error('chrome.menus.update is not implemented');
  }

  remove(..._args: any[]): any {
    throw new Error('chrome.menus.remove is not implemented');
  }

  removeAll(..._args: any[]): any {
    throw new Error('chrome.menus.removeAll is not implemented');
  }

  /**
   * Firefox-only: forces the next `onShown` event for the calling
   * extension to re-evaluate properties. DDX has no menu-refresh
   * primitive so this no-ops at the class level (not RPC-bound).
   */
  refresh(): void {
    return;
  }

  /**
   * Firefox-only: programmatically open an overflow menu. DDX has
   * no native menu-overflow concept so this no-ops.
   */
  overrideContext(..._args: any[]): any {
    return;
  }

  static readonly ContextType = {
    ACTION: 'action',
    ALL: 'all',
    AUDIO: 'audio',
    BROWSER_ACTION: 'browser_action',
    EDITABLE: 'editable',
    FRAME: 'frame',
    IMAGE: 'image',
    LAUNCHER: 'launcher',
    LINK: 'link',
    PAGE: 'page',
    PAGE_ACTION: 'page_action',
    SELECTION: 'selection',
    TAB: 'tab',
    TOOLS_MENU: 'tools_menu',
    VIDEO: 'video',
  } as const;

  static readonly ItemType = {
    CHECKBOX: 'checkbox',
    NORMAL: 'normal',
    RADIO: 'radio',
    SEPARATOR: 'separator',
  } as const;

  static readonly ACTION_MENU_TOP_LEVEL_LIMIT: number = 6;
}
