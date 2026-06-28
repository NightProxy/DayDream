import type { ExtensionContext } from '../../extfs/types';

export class ChromeSidePanel {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  getLayout(..._args: any[]): any {
    throw new Error('chrome.sidePanel.getLayout is not implemented');
  }

  getOptions(..._args: any[]): any {
    throw new Error('chrome.sidePanel.getOptions is not implemented');
  }

  getPanelBehavior(..._args: any[]): any {
    throw new Error('chrome.sidePanel.getPanelBehavior is not implemented');
  }

  open(..._args: any[]): any {
    throw new Error('chrome.sidePanel.open is not implemented');
  }

  setOptions(..._args: any[]): any {
    throw new Error('chrome.sidePanel.setOptions is not implemented');
  }

  setPanelBehavior(..._args: any[]): any {
    throw new Error('chrome.sidePanel.setPanelBehavior is not implemented');
  }

  static readonly Side = {
    LEFT: "left",
    RIGHT: "right",
  } as const;

}
