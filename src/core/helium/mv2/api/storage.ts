import type { ExtensionContext } from '../../extfs/types';
import { ChromeStorageBase } from '../../shared';

export class ChromeStorage extends ChromeStorageBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
