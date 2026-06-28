import type { ExtensionContext } from '../../extfs/types';
import { ChromeTabCaptureBase } from '../../shared';

export class ChromeTabCapture extends ChromeTabCaptureBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }
}
