import type { ExtensionContext } from '../../extfs/types';

export class ChromeDom {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  openOrClosedShadowRoot(..._args: any[]): any {
    throw new Error('chrome.dom.openOrClosedShadowRoot is not implemented');
  }

}
