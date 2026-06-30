
import type { ExtensionContext } from '../../extfs/types';

export class WebRequestHandlers {
  /**
   * chrome.webRequest.handlerBehaviorChanged()
   *
   * Per Chrome docs: "Should be used to inform the browser that the
   * behavior of the webRequest handlers has changed." We don't cache
   * anything that needs invalidating, so this is a no-op.
   */
  handlerBehaviorChanged = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<void> => {
    return undefined;
  };
}
