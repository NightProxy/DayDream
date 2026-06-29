import type { ExtensionContext } from '../../extfs/types';
import { ChromeSystemBase, ChromeSystemStorageBase } from '../../shared';

class ChromeSystemStorage extends ChromeSystemStorageBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  // MV3-only. Returns 0 — we don't manage external storage. Real Chrome
  // returns the free bytes on the storage unit; with no units, returning
  // 0 is honest. Extensions that branch on >0 will pick the "no space"
  // path which is safer than the "infinite space" lie.
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
