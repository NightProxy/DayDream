import type { ExtensionContext } from '../../extfs/types';
import { ChromeTabsBase } from '../../shared';

export class ChromeTabs extends ChromeTabsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
