import type { ExtensionContext } from '../../extfs/types';
import { ChromeSystemBase } from '../../shared';

export class ChromeSystem extends ChromeSystemBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
