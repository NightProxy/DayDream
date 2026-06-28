import type { ExtensionContext } from '../../extfs/types';
import { ChromeIdentityBase } from '../../shared';

export class ChromeIdentity extends ChromeIdentityBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
