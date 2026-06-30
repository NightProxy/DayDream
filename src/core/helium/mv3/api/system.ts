import type { ExtensionContext } from '../../extfs/types';
import { ChromeSystemBase, ChromeSystemStorageBase } from '../../shared';

class ChromeSystemStorage extends ChromeSystemStorageBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  getAvailableCapacity(...args: any[]): any {
    const result = { id: 'unknown', availableCapacity: 0 };
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (cb) { try { cb(result); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(result);
  }
}

export class ChromeSystem extends ChromeSystemBase {
  public override storage: ChromeSystemStorage;

  constructor(ctx: ExtensionContext) {
    super(ctx);
    this.storage = new ChromeSystemStorage(ctx);
  }
}
