import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeCommands {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onCommand: ChromeEvent = new ChromeEvent();

  getAll(..._args: any[]): any {
    throw new Error('chrome.commands.getAll is not implemented');
  }
}
