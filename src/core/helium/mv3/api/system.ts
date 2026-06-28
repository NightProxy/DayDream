import type { ExtensionContext } from '../../extfs/types';
import { ChromeSystemBase, ChromeSystemStorageBase } from '../../shared';

class ChromeSystemStorage extends ChromeSystemStorageBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  getAvailableCapacity(..._args: any[]): any {
    throw new Error('chrome.system.storage.getAvailableCapacity is not implemented');
  }
}

export class ChromeSystem extends ChromeSystemBase {
  public override storage: ChromeSystemStorage;

  constructor(ctx: ExtensionContext) {
    super(ctx);
    this.storage = new ChromeSystemStorage(ctx);
  }
}
