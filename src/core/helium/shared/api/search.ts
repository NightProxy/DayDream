import type { ExtensionContext } from '../../extfs/types';

export class ChromeSearch {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  query(..._args: any[]): any {
    throw new Error('chrome.search.query is not implemented');
  }

  static readonly Disposition = {
    CURRENT_TAB: "CURRENT_TAB",
    NEW_TAB: "NEW_TAB",
    NEW_WINDOW: "NEW_WINDOW",
  } as const;

}
