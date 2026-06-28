import type { ExtensionContext } from '../../extfs/types';

export class ChromeScripting {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  executeScript(..._args: any[]): any {
    throw new Error('chrome.scripting.executeScript is not implemented');
  }

  getRegisteredContentScripts(..._args: any[]): any {
    throw new Error('chrome.scripting.getRegisteredContentScripts is not implemented');
  }

  insertCSS(..._args: any[]): any {
    throw new Error('chrome.scripting.insertCSS is not implemented');
  }

  registerContentScripts(..._args: any[]): any {
    throw new Error('chrome.scripting.registerContentScripts is not implemented');
  }

  removeCSS(..._args: any[]): any {
    throw new Error('chrome.scripting.removeCSS is not implemented');
  }

  unregisterContentScripts(..._args: any[]): any {
    throw new Error('chrome.scripting.unregisterContentScripts is not implemented');
  }

  updateContentScripts(..._args: any[]): any {
    throw new Error('chrome.scripting.updateContentScripts is not implemented');
  }

  static readonly ExecutionWorld = {
    ISOLATED: "ISOLATED",
    MAIN: "MAIN",
  } as const;

  static readonly StyleOrigin = {
    AUTHOR: "AUTHOR",
    USER: "USER",
  } as const;

}
