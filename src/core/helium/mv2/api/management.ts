import type { ExtensionContext } from '../../extfs/types';
import { ChromeManagementBase } from '../../shared';

export class ChromeManagement extends ChromeManagementBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  static readonly ExtensionType = {
    EDGE_PANEL_APP: "edge_panel_app",
    EXTENSION: "extension",
    HOSTED_APP: "hosted_app",
    LEGACY_PACKAGED_APP: "legacy_packaged_app",
    LOGIN_SCREEN_EXTENSION: "login_screen_extension",
    PACKAGED_APP: "packaged_app",
    THEME: "theme",
  } as const;
}
