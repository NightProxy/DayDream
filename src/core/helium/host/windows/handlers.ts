// src/core/helium/host/windows/handlers.ts
//
// chrome.windows.* host handlers. Delegates to the NyxBridge windows.*
// methods. DDX is single-window; create maps to creating tabs in the
// existing window.

import {
  dispatch as nyxDispatch,
  type HandlerContext as NyxHandlerContext,
} from '@apis/nyxBridge/handlers';
import type { ExtensionContext } from '../../extfs/types';

export class WindowsHandlers {
  constructor(private readonly nyxCtx: NyxHandlerContext) {}

  get = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.get', { windowId: args[0], populate: (args[1] as { populate?: boolean } | undefined)?.populate });

  getCurrent = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.getCurrent', args[0] ?? {});

  getLastFocused = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.getLastFocused', args[0] ?? {});

  getAll = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.getAll', args[0] ?? {});

  create = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.create', args[0] ?? {});

  update = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.update', { windowId: args[0], updateInfo: args[1] });

  remove = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'windows.remove', { windowId: args[0] });
}
