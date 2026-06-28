import type { ExtensionContext } from '../../extfs/types';

export class ChromePower {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  releaseKeepAwake(..._args: any[]): any {
    throw new Error('chrome.power.releaseKeepAwake is not implemented');
  }

  requestKeepAwake(..._args: any[]): any {
    throw new Error('chrome.power.requestKeepAwake is not implemented');
  }

  static readonly Level = {
    DISPLAY: "display",
    SYSTEM: "system",
  } as const;

}
