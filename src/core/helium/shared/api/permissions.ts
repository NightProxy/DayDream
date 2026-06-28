import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '../ChromeEvent';

export class ChromePermissionsBase {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onRemoved: ChromeEvent = new ChromeEvent();
  public readonly onAdded: ChromeEvent = new ChromeEvent();

  contains(..._args: any[]): any {
    throw new Error('chrome.permissions.contains is not implemented');
  }
  getAll(..._args: any[]): any {
    throw new Error('chrome.permissions.getAll is not implemented');
  }
  remove(..._args: any[]): any {
    throw new Error('chrome.permissions.remove is not implemented');
  }
  request(..._args: any[]): any {
    throw new Error('chrome.permissions.request is not implemented');
  }
}
