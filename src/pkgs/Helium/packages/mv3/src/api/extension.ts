export class ChromeExtension {
  public inIncognitoContext: boolean = false;

  isAllowedFileSchemeAccess(...args: any[]): any {
    throw new Error('chrome.extension.isAllowedFileSchemeAccess is not implemented');
  }

  isAllowedIncognitoAccess(...args: any[]): any {
    throw new Error('chrome.extension.isAllowedIncognitoAccess is not implemented');
  }

  setUpdateUrlData(...args: any[]): any {
    throw new Error('chrome.extension.setUpdateUrlData is not implemented');
  }

  static readonly ViewType = {
    POPUP: "popup",
    TAB: "tab",
  } as const;

}
