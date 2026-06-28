import type { ExtensionContext } from '../../extfs/types';
import { ChromePermissionsBase } from '../../shared';

export class ChromePermissions extends ChromePermissionsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
