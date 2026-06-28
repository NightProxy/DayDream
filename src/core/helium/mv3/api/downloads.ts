import type { ExtensionContext } from '../../extfs/types';
import { ChromeDownloadsBase } from '../../shared';

export class ChromeDownloads extends ChromeDownloadsBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
