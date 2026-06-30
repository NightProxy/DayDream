import type { ExtensionContext } from '../../extfs/types';

/**
 * `chrome.dom` — extension-internal DOM extensions.
 *
 * `openOrClosedShadowRoot(element)` returns the element's shadow root
 * whether it was attached with `mode: 'open'` or `mode: 'closed'`.
 *
 * **Limitation**: real Chrome can access closed shadow roots because
 * extensions have a privileged binding. We can't actually access
 * closed roots from a regular extension iframe — `Element.shadowRoot`
 * only returns open roots. We return the open root if present,
 * `null` otherwise. Most extensions that use this API are content
 * scripts inspecting their target page's DOM and the page's roots are
 * usually open in practice.
 */
export class ChromeDom {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  openOrClosedShadowRoot(...args: any[]): ShadowRoot | null {
    const el = args[0];
    if (!el || typeof el !== 'object') return null;
    if ('shadowRoot' in el && el.shadowRoot) {
      return el.shadowRoot as ShadowRoot;
    }
    return null;
  }
}
