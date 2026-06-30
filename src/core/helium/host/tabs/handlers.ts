
import {
  dispatch as nyxDispatch,
  type HandlerContext as NyxHandlerContext,
} from '@apis/nyxBridge/handlers';
import type { ExtensionContext } from '../../extfs/types';

interface PendingReply {
  resolve: (v: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class TabsHandlers {
  private nextReqId = 0;
  private readonly pendingReplies = new Map<number, PendingReply>();

  constructor(private readonly nyxCtx: NyxHandlerContext) {
    window.addEventListener('message', (e) => {
      const data = e.data as
        | { __helium_bg_to_cs__?: string; reqId?: number; response?: unknown }
        | null;
      if (!data || typeof data !== 'object') return;
      if (data.__helium_bg_to_cs__ !== 'reply') return;
      if (typeof data.reqId !== 'number') return;
      const p = this.pendingReplies.get(data.reqId);
      if (!p) return;
      clearTimeout(p.timer);
      this.pendingReplies.delete(data.reqId);
      p.resolve(data.response);
    });
  }

  query = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.query', args[0] ?? {});

  get = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.get', args[0]);

  getCurrent = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.getCurrent', {});

  create = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.create', args[0] ?? {});

  update = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.update', args);

  remove = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.remove', args[0]);

  duplicate = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.duplicate', args[0]);

  reload = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> => {
    const props = args[1] as { bypassCache?: boolean } | undefined;
    if (props?.bypassCache) return nyxDispatch(this.nyxCtx, 'tabs.hardReload', { tabId: args[0] });
    return nyxDispatch(this.nyxCtx, 'tabs.reload', args[0]);
  };

  goBack = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.goBack', args[0]);

  goForward = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.goForward', args[0]);

  captureVisibleTab = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.captureVisibleTab', args);

  move = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.move', { tabIds: args[0], properties: args[1] });

  group = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.group', args[0]);

  ungroup = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.ungroup', args[0]);

  detectLanguage = async (_ctx: ExtensionContext, _args: unknown[]): Promise<string> => 'und';

  discard = async (_ctx: ExtensionContext, args: unknown[]): Promise<unknown> =>
    nyxDispatch(this.nyxCtx, 'tabs.get', args[0]);

  highlight = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => ({
    id: 1,
    focused: true,
  });

  getZoom = async (_ctx: ExtensionContext, _args: unknown[]): Promise<number> => 1.0;
  setZoom = async (_ctx: ExtensionContext, _args: unknown[]): Promise<void> => undefined;
  getZoomSettings = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => ({
    mode: 'automatic', scope: 'per-origin', defaultZoomFactor: 1.0,
  });
  setZoomSettings = async (_ctx: ExtensionContext, _args: unknown[]): Promise<void> => undefined;

  toggleReaderMode = async (_ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    throw new Error('chrome.tabs.toggleReaderMode is not supported');
  };

  /**
   * Deliver a message into the page realm of a particular tab.
   *
   * Posts `__helium_bg_to_cs__: 'msg'` to the iframe's contentWindow with a
   * unique reqId. mini-chrome-instance.ts dispatches the message to every
   * registered content-script instance for this extension, synthesizing a
   * sendResponse that posts back `__helium_bg_to_cs__: 'reply'`. If no
   * listener responds within 30s, resolves undefined.
   */
  sendMessage = async (ctx: ExtensionContext, args: unknown[]): Promise<unknown> => {
    const tabId = args[0] as number;
    const message = args[1];
    void args[2];

    let iframe: HTMLIFrameElement;
    try {
      iframe = this.nyxCtx.tabResolver.resolveIframe(tabId);
    } catch {
      throw new Error(`Tab ${tabId} not found`);
    }
    const win = iframe.contentWindow;
    if (!win) throw new Error('tab has no contentWindow');

    return new Promise<unknown>((resolve) => {
      const reqId = ++this.nextReqId;
      const timer = setTimeout(() => {
        this.pendingReplies.delete(reqId);
        resolve(undefined);
      }, 30_000);
      this.pendingReplies.set(reqId, { resolve, timer });
      try {
        win.postMessage(
          {
            __helium_bg_to_cs__: 'msg',
            extId: ctx.id,
            message,
            sender: { id: ctx.id },
            reqId,
          },
          '*',
        );
      } catch {
        clearTimeout(timer);
        this.pendingReplies.delete(reqId);
        resolve(undefined);
      }
    });
  };
}
