import type { ExtensionContext } from '../../extfs/types';

export class ChromePageCapture {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  saveAsMHTML(..._args: any[]): any {
    throw new Error('chrome.pageCapture.saveAsMHTML is not implemented');
  }

}
