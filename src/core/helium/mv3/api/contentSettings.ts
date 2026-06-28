import type { ExtensionContext } from '../../extfs/types';
import { ChromeContentSettingsBase } from '../../shared';

export class ChromeContentSettings extends ChromeContentSettingsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
