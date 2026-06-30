
import { WebRequestPlugin } from './plugin';
import type { WebRequestRegistry } from './registry';
import type { DnrEngineFacade } from './dnr-bridge';
import type { RequestDetails, TabResolverDep } from './events';

export { WebRequestPlugin } from './plugin';
export {
  WebRequestRegistry,
  type Subscriber,
  type WebRequestEvent,
  type WebRequestListener,
  type ExtraInfoSpec,
} from './registry';
export {
  matchesRequest,
  type RequestFilter,
  type ResourceType,
  type FilterableRequest,
} from './filter';
export {
  buildRequestDetails,
  dispatchEvent,
  getOrAssignRequestId,
  inferResourceType,
  type BlockingResponse,
  type RequestDetails,
  type TabResolverDep,
  type FrameContext,
} from './events';
export {
  type DnrEngineFacade,
  type DnrEvaluationResult,
  type DnrHeaderOp,
  type DnrModifyHeadersQueue,
  type DnrHeaderOperation,
} from './dnr-bridge';
export { WebRequestHandlers } from './handlers';
export { installWebRequestEventRpc } from './host-rpc';
export {
  applySwDnrUpdate,
  buildSwDnrUpdate,
  evaluateSwLevelRules,
  pushRulesToSw,
  SW_DNR_UPDATE_MESSAGE_TYPE,
  type SwDnrUpdateMessage,
} from './sw-hook';

interface InstallDeps {
  registry: WebRequestRegistry;
  dnr?: DnrEngineFacade | null;
  /**
   * Optional observer fired on fetch.response — used by the
   * chrome.devtools.network fan-out (Phase 4 / Task 32) to deliver
   * onRequestFinished events to devtools_page subscribers.
   */
  onResponseObserver?: ((details: RequestDetails) => void) | null;
  /**
   * NyxBridge tab resolver. Threaded into every per-frame plugin so
   * the dispatcher can fill in real DDX tab ids on each emitted
   * RequestDetails. When omitted, every event carries `tabId: -1`,
   * which still satisfies the contract but collapses any listener
   * filter that pins a specific tab.
   */
  tabResolver?: TabResolverDep | null;
}

let installed = false;

/**
 * Wrap `controller.createFrame` so every proxied frame gets a
 * WebRequestPlugin attached. Mirrors `installScriptInjector` / the
 * other per-frame plugin installers.
 *
 * Idempotent.
 */
export function installWebRequestHook(
  controller: unknown,
  deps: InstallDeps,
): void {
  if (installed) return;
  const c = controller as {
    createFrame?: (...args: unknown[]) => unknown;
  } | null;
  if (!c || typeof c.createFrame !== 'function') {
    console.warn(
      '[helium/webRequest] controller has no createFrame; not installed',
    );
    return;
  }
  const orig = c.createFrame.bind(c);
  c.createFrame = function (...args: unknown[]) {
    const opts = args[1] as { plugins?: unknown[] } | undefined;
    const plugin = new WebRequestPlugin({
      registry: deps.registry,
      ...(deps.dnr !== undefined ? { dnr: deps.dnr } : {}),
      ...(deps.onResponseObserver !== undefined
        ? { onResponseObserver: deps.onResponseObserver }
        : {}),
      ...(deps.tabResolver !== undefined
        ? { tabResolver: deps.tabResolver }
        : {}),
    });
    const nextOpts: { plugins: unknown[] } = {
      plugins: [...(opts?.plugins ?? []), plugin],
    };
    return orig(args[0], nextOpts);
  };
  installed = true;
}
