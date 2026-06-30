
import type { ExtensionContext } from '../../extfs/types';
import {
  dispatch as nyxDispatch,
  type HandlerContext as NyxHandlerContext,
} from '@apis/nyxBridge/handlers';

export class WebNavigationHandlers {
  constructor(private readonly nyxCtx: NyxHandlerContext) {}

  getFrame = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'webNavigation.getFrame', args[0]);

  getAllFrames = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'webNavigation.getAllFrames', args[0]);
}
