import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

/**
 * `chrome.pageAction` — MV2-style per-tab action icon.
 *
 * Historically MV2-only, but DDX exposes the same surface on both
 * MV2 and MV3 builds so extensions that detect either path still
 * see a non-undefined `chrome.pageAction`. The host wiring lives in
 * `host/action/handlers.ts` (`pageActionShow`, `pageActionHide`,
 * `pageActionIsShown`) and the toolbar renderer at
 * `browser/extensions/toolbarButtons.ts` lights up the icon when
 * `pageActionIsShown(extId, activeTabId)` is true.
 *
 * All methods here are throw-stubs at construction time; they are
 * overlaid by `installRpcBindings` (bootstrap/client.ts) at handshake
 * with Promise-returning wrappers that call the host handlers.
 *
 * `show` / `hide` accept the legacy MV2 signatures (`(tabId)` and
 * `(details)`-style). The host handler normalises `tabId` from
 * either form.
 */
export class ChromePageAction {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  /**
   * Fired when the user clicks the page-action icon for a tab where
   * `show()` was called and no `default_popup` is set on the
   * extension. Toolbar renderer at
   * `browser/extensions/toolbarButtons.ts:455-461` dispatches this.
   * Listener signature mirrors Chrome's: `(tab: chrome.tabs.Tab)`.
   */
  public readonly onClicked: ChromeEvent = new ChromeEvent();

  show(..._args: any[]): any {
    throw new Error('chrome.pageAction.show is not implemented');
  }

  hide(..._args: any[]): any {
    throw new Error('chrome.pageAction.hide is not implemented');
  }

  setTitle(..._args: any[]): any {
    throw new Error('chrome.pageAction.setTitle is not implemented');
  }

  getTitle(..._args: any[]): any {
    throw new Error('chrome.pageAction.getTitle is not implemented');
  }

  setIcon(..._args: any[]): any {
    throw new Error('chrome.pageAction.setIcon is not implemented');
  }

  setPopup(..._args: any[]): any {
    throw new Error('chrome.pageAction.setPopup is not implemented');
  }

  getPopup(..._args: any[]): any {
    throw new Error('chrome.pageAction.getPopup is not implemented');
  }
}
