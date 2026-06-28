import type { ExtensionContext } from '../../extfs/types';
import { ChromeContentSettingsBase, ContentSetting } from '../../shared';

export class ChromeContentSettings extends ChromeContentSettingsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly sound: ContentSetting = new ContentSetting();

  static readonly SoundContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
  } as const;
}
