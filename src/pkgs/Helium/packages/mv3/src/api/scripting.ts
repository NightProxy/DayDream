export class ChromeScripting {

  executeScript(...args: any[]): any {
    throw new Error('chrome.scripting.executeScript is not implemented');
  }

  getRegisteredContentScripts(...args: any[]): any {
    throw new Error('chrome.scripting.getRegisteredContentScripts is not implemented');
  }

  insertCSS(...args: any[]): any {
    throw new Error('chrome.scripting.insertCSS is not implemented');
  }

  registerContentScripts(...args: any[]): any {
    throw new Error('chrome.scripting.registerContentScripts is not implemented');
  }

  removeCSS(...args: any[]): any {
    throw new Error('chrome.scripting.removeCSS is not implemented');
  }

  unregisterContentScripts(...args: any[]): any {
    throw new Error('chrome.scripting.unregisterContentScripts is not implemented');
  }

  updateContentScripts(...args: any[]): any {
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
