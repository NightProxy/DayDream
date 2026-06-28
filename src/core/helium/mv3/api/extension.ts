import type { ExtensionContext } from '../../extfs/types';
import { ChromeExtensionBase } from '../../shared';

export class ChromeExtension extends ChromeExtensionBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
