import type { ExtensionContext } from '../../extfs/types';
import { ChromeStorageBase, StorageArea } from '../../shared';

class ChromeStorageSession extends StorageArea {
  static readonly QUOTA_BYTES: number = 10485760;
}

export class ChromeStorage extends ChromeStorageBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly session: ChromeStorageSession = new ChromeStorageSession();
}
