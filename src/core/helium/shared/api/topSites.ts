import type { ExtensionContext } from '../../extfs/types';

export class ChromeTopSites {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  get(..._args: any[]): any {
    throw new Error('chrome.topSites.get is not implemented');
  }

}
