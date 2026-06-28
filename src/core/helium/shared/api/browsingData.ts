import type { ExtensionContext } from '../../extfs/types';

export class ChromeBrowsingData {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  remove(..._args: any[]): any {
    throw new Error('chrome.browsingData.remove is not implemented');
  }

  removeAppcache(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeAppcache is not implemented');
  }

  removeCache(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeCache is not implemented');
  }

  removeCacheStorage(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeCacheStorage is not implemented');
  }

  removeCookies(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeCookies is not implemented');
  }

  removeDownloads(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeDownloads is not implemented');
  }

  removeFileSystems(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeFileSystems is not implemented');
  }

  removeFormData(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeFormData is not implemented');
  }

  removeHistory(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeHistory is not implemented');
  }

  removeIndexedDB(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeIndexedDB is not implemented');
  }

  removeLocalStorage(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeLocalStorage is not implemented');
  }

  removePasswords(..._args: any[]): any {
    throw new Error('chrome.browsingData.removePasswords is not implemented');
  }

  removePluginData(..._args: any[]): any {
    throw new Error('chrome.browsingData.removePluginData is not implemented');
  }

  removeServiceWorkers(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeServiceWorkers is not implemented');
  }

  removeWebSQL(..._args: any[]): any {
    throw new Error('chrome.browsingData.removeWebSQL is not implemented');
  }

  settings(..._args: any[]): any {
    throw new Error('chrome.browsingData.settings is not implemented');
  }

}
