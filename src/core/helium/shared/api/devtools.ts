import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

/**
 * Bootstrap-side stubs for `chrome.devtools.*`.
 *
 * These classes are ONLY instantiated for iframes spawned with
 * `inDevtools: true` in their ExtensionContext (i.e. devtools_page
 * iframes spawned by DevtoolsPageHost). Every method here throws —
 * the bootstrap's `installRpcBindings` walker overwrites each method
 * listed in RPC_BINDINGS with a host-RPC trampoline before the
 * extension's own scripts run.
 *
 * Events are kept as `ChromeEvent` instances so the host's event
 * router (which posts back through the bridge channel) can locate
 * them via path-resolution.
 */

class ChromeDevtoolsPanelsElements {
  public readonly onSelectionChanged: ChromeEvent = new ChromeEvent();

  createSidebarPane(..._args: any[]): any {
    throw new Error(
      'chrome.devtools.panels.elements.createSidebarPane is not implemented',
    );
  }
}

class ChromeDevtoolsPanelsSources {
  createSidebarPane(..._args: any[]): any {
    throw new Error(
      'chrome.devtools.panels.sources.createSidebarPane is not implemented',
    );
  }
}

export class ChromeDevtoolsPanels {
  public readonly elements: ChromeDevtoolsPanelsElements =
    new ChromeDevtoolsPanelsElements();
  public readonly sources: ChromeDevtoolsPanelsSources =
    new ChromeDevtoolsPanelsSources();
  /** Themename ('default' | 'dark') — overwritten by host on handshake. */
  public themeName: string = 'default';

  create(..._args: any[]): any {
    throw new Error('chrome.devtools.panels.create is not implemented');
  }

  setOpenResourceHandler(..._args: any[]): any {
    throw new Error(
      'chrome.devtools.panels.setOpenResourceHandler is not implemented',
    );
  }

  openResource(..._args: any[]): any {
    throw new Error('chrome.devtools.panels.openResource is not implemented');
  }
}

export class ChromeDevtoolsInspectedWindow {
  /**
   * Real Chrome's `chrome.devtools.inspectedWindow.tabId` is a
   * SYNCHRONOUS number property. We read it from the on-wire
   * helium-ctx that the bootstrap parsed out of `<meta name=
   * "helium-ctx">` — DevtoolsPageHost bakes `ctx.inspectedTabId`
   * into every devtools_page iframe at spawn time.
   *
   * Falls back to -1 if not present (which means something is
   * misconfigured — the devtools_page should always be spawned
   * with a tabId). Extensions that branch on tabId>=0 get the
   * "no tab" path, which is at worst a no-op.
   *
   * IMPORTANT: this property is EXCLUDED from RPC_BINDINGS in
   * `bootstrap/client.ts` so installRpcBindings doesn't overwrite
   * the sync number with an async function.
   */
  public readonly tabId: number;

  constructor(ctx: ExtensionContext) {
    this.tabId = typeof ctx.inspectedTabId === 'number' ? ctx.inspectedTabId : -1;
  }

  eval(..._args: any[]): any {
    throw new Error('chrome.devtools.inspectedWindow.eval is not implemented');
  }

  reload(..._args: any[]): any {
    throw new Error(
      'chrome.devtools.inspectedWindow.reload is not implemented',
    );
  }

  getResources(..._args: any[]): any {
    throw new Error(
      'chrome.devtools.inspectedWindow.getResources is not implemented',
    );
  }

  public readonly onResourceAdded: ChromeEvent = new ChromeEvent();
  public readonly onResourceContentCommitted: ChromeEvent = new ChromeEvent();
}

export class ChromeDevtoolsNetwork {
  public readonly onRequestFinished: ChromeEvent = new ChromeEvent();
  public readonly onNavigated: ChromeEvent = new ChromeEvent();

  getHAR(..._args: any[]): any {
    throw new Error('chrome.devtools.network.getHAR is not implemented');
  }
}

/**
 * Root `chrome.devtools` namespace. Attached to the chrome global
 * only when ctx.inDevtools === true (set by DevtoolsPageHost via
 * HeliumExtensionPlugin ctxOverrides).
 */
export class ChromeDevtools {
  protected readonly ctx: ExtensionContext;
  public readonly panels: ChromeDevtoolsPanels = new ChromeDevtoolsPanels();
  public readonly inspectedWindow: ChromeDevtoolsInspectedWindow;
  public readonly network: ChromeDevtoolsNetwork = new ChromeDevtoolsNetwork();

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.inspectedWindow = new ChromeDevtoolsInspectedWindow(ctx);
  }
}
