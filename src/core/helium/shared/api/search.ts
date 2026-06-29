import type { ExtensionContext } from '../../extfs/types';

export class ChromeSearch {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  // Overridden post-handshake by installRpcBindings — this throw is
  // a fallback for the rare pre-handshake call. The host handler in
  // `apis/extensions.ts` resolves the configured search engine,
  // builds the URL, and opens it as a new tab / current tab per
  // disposition.
  query(..._args: any[]): any {
    throw new Error('chrome.search.query is not implemented');
  }

  static readonly Disposition = {
    CURRENT_TAB: "CURRENT_TAB",
    NEW_TAB: "NEW_TAB",
    NEW_WINDOW: "NEW_WINDOW",
  } as const;

}
