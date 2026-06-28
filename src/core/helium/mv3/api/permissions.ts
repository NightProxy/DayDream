import type { ExtensionContext } from '../../extfs/types';
import { ChromePermissionsBase } from '../../shared';

export class ChromePermissions extends ChromePermissionsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  addHostAccessRequest(..._args: any[]): any {
    throw new Error('chrome.permissions.addHostAccessRequest is not implemented');
  }
  removeHostAccessRequest(..._args: any[]): any {
    throw new Error('chrome.permissions.removeHostAccessRequest is not implemented');
  }
}
