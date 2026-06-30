
import type { ExtensionBridgeChannel } from '../../bootstrap/channel';
import type {
  ExtraInfoSpec,
  WebRequestEvent,
  WebRequestRegistry,
} from './registry';
import type { RequestFilter } from './filter';

const WEB_REQUEST_EVENT_PREFIX = 'chrome.webRequest.';

const ALLOWED_EVENTS = new Set<WebRequestEvent>([
  'onBeforeRequest',
  'onBeforeSendHeaders',
  'onSendHeaders',
  'onHeadersReceived',
  'onAuthRequired',
  'onResponseStarted',
  'onBeforeRedirect',
  'onCompleted',
  'onErrorOccurred',
]);

function parseEvent(method: string): WebRequestEvent | null {
  if (!method.startsWith(WEB_REQUEST_EVENT_PREFIX)) return null;
  const name = method.slice(WEB_REQUEST_EVENT_PREFIX.length) as WebRequestEvent;
  if (!ALLOWED_EVENTS.has(name)) return null;
  return name;
}

/**
 * Wire the `__helium_event_subscribe__` / `__helium_event_unsubscribe__`
 * handlers on the given channel. Each subscription is materialized
 * as a Subscriber on `registry`, scoped to `extId`. The Subscriber's
 * listener round-trips via `channel.requestEvent` to deliver the
 * event details to the BG and await a BlockingResponse.
 *
 * Returns a disposer fn that clears all subscriptions for `extId`.
 * Call it during ExtensionManager.kill.
 */
export function installWebRequestEventRpc(
  channel: ExtensionBridgeChannel,
  extId: string,
  registry: WebRequestRegistry,
  opts: { blockingTimeoutMs?: number } = {},
): () => void {
  const timeoutMs = opts.blockingTimeoutMs ?? 5000;
  const opaqueMap = new Map<number, number>();

  channel.registerHandler('__helium_event_subscribe__', async (req) => {
    const [methodRaw, bgOpaqueId, filterRaw, extraInfoRaw] = req.args as [
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    const method = typeof methodRaw === 'string' ? methodRaw : '';
    const event = parseEvent(method);
    if (!event) {
      throw new Error(`Unsupported event subscription: ${method}`);
    }
    if (typeof bgOpaqueId !== 'number') {
      throw new Error('Subscribe: missing opaqueId');
    }
    const filter = normalizeFilter(filterRaw);
    const extraInfoSpec = normalizeExtraInfo(extraInfoRaw);

    const handle = registry.subscribe(
      extId,
      event,
      async (details) => {
        try {
          const result = await channel.requestEvent(
            method,
            [bgOpaqueId, details],
            { timeoutMs },
          );
          return result;
        } catch (err) {
          console.warn(
            `[helium/webRequest] requestEvent ${method} for ${extId} failed:`,
            err,
          );
          return undefined;
        }
      },
      filter,
      extraInfoSpec,
    );

    opaqueMap.set(bgOpaqueId, handle.opaqueId);
    return undefined;
  });

  channel.registerHandler('__helium_event_unsubscribe__', async (req) => {
    const [methodRaw, bgOpaqueIdRaw] = req.args as [unknown, unknown];
    void methodRaw;
    if (typeof bgOpaqueIdRaw !== 'number') return undefined;
    const registryId = opaqueMap.get(bgOpaqueIdRaw);
    if (typeof registryId === 'number') {
      registry.unsubscribe(registryId);
      opaqueMap.delete(bgOpaqueIdRaw);
    }
    return undefined;
  });

  return () => {
    for (const registryId of opaqueMap.values()) {
      registry.unsubscribe(registryId);
    }
    opaqueMap.clear();
    registry.clearForExt(extId);
  };
}

function normalizeFilter(raw: unknown): RequestFilter {
  if (!raw || typeof raw !== 'object') return { urls: ['<all_urls>'] };
  const r = raw as Partial<RequestFilter>;
  const out: RequestFilter = {
    urls: Array.isArray(r.urls) && r.urls.length > 0 ? r.urls : ['<all_urls>'],
  };
  if (Array.isArray(r.types) && r.types.length > 0) out.types = r.types;
  if (typeof r.tabId === 'number') out.tabId = r.tabId;
  if (typeof r.windowId === 'number') out.windowId = r.windowId;
  return out;
}

function normalizeExtraInfo(raw: unknown): ExtraInfoSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraInfoSpec[] = [];
  for (const v of raw) {
    if (
      v === 'blocking' ||
      v === 'requestHeaders' ||
      v === 'responseHeaders' ||
      v === 'extraHeaders' ||
      v === 'asyncBlocking'
    ) {
      out.push(v);
    }
  }
  return out;
}
