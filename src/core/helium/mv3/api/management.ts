import type { ExtensionContext } from '../../extfs/types';
import { ChromeManagementBase } from '../../shared';

export class ChromeManagement extends ChromeManagementBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
