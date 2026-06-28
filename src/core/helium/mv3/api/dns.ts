import type { ExtensionContext } from '../../extfs/types';

export class ChromeDns {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  resolve(..._args: any[]): any {
    throw new Error('chrome.dns.resolve is not implemented');
  }

}
