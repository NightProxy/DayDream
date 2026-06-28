// src/core/helium/host/webRequest/events.ts
//
// Event dispatchers: take a Scramjet request + frame context, build
// chrome.webRequest `details`, walk the registry, await blocking
// subscribers, then apply their merged response back onto the
// hook's `props` object.
//
// Each dispatcher follows the same pattern:
//   1. Build details (URL, method, type, requestId, tabId, ...)
//   2. Iterate matching subscribers via `registry.forEvent(event)`
//   3. For blocking subscribers: await `listener(details)` and merge
//      responses (cancel wins; redirect wins; headers merged in order)
//   4. For observer subscribers: fire without awaiting (best-effort)
//   5. Mutate `props` per the merged response
//
// The `listener` set in the registry is the host-side internal
// callback that routes to the BG via `channel.requestEvent` (added
// in Task 27). For now, we accept that the listener is opaque and
// returns whatever the extension's listener returned.

import type { WebRequestRegistry, WebRequestEvent } from './registry';
import {
  type FilterableRequest,
  matchesRequest,
  type ResourceType,
} from './filter';

// --- requestId WeakMap (UUID per request) ----------------------

const requestIdMap = new WeakMap<object, string>();

function uuid(): string {
  // RFC4122 v4 via crypto.randomUUID when available; fallback to manual.
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  const fn = g.crypto?.randomUUID;
  if (typeof fn === 'function') return fn.call(g.crypto);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  // v4
  b[6] = ((b[6]! & 0x0f) | 0x40) as 0x40;
  b[8] = ((b[8]! & 0x3f) | 0x80) as 0x80;
  return (
    hex(b[0]!) + hex(b[1]!) + hex(b[2]!) + hex(b[3]!) + '-' +
    hex(b[4]!) + hex(b[5]!) + '-' +
    hex(b[6]!) + hex(b[7]!) + '-' +
    hex(b[8]!) + hex(b[9]!) + '-' +
    hex(b[10]!) + hex(b[11]!) + hex(b[12]!) + hex(b[13]!) + hex(b[14]!) + hex(b[15]!)
  );
}

/**
 * Look up (or synthesize) the requestId for a Scramjet request. The
 * key is the request object itself, so the same id propagates from
 * fetch.intercept all the way to fetch.response / error.request.
 */
export function getOrAssignRequestId(reqObj: object): string {
  let id = requestIdMap.get(reqObj);
  if (!id) {
    id = uuid();
    requestIdMap.set(reqObj, id);
  }
  return id;
}

// --- Scramjet → webRequest mapping helpers ---------------------

/**
 * Map Scramjet's request kind / fetch destination to a
 * chrome.webRequest ResourceType.
 *
 * Source of truth (Scramjet types — see
 * scramjet/packages/core/src/fetch/index.ts):
 *   - `ScramjetFetchParsed.destination: RequestDestination` — the
 *     post-rewrite destination, overridden by `$dest` if the URL
 *     carries one. This is the primary signal.
 *   - `ScramjetFetchRequest.rawDestination: RequestDestination` —
 *     the original Fetch Standard destination as captured pre-rewrite.
 *
 * The error.request hook ships a `rawrequest` (TransferRequest) with
 * `destination: RequestDestination` instead. We probe all three so
 * the same helper handles every dispatcher.
 *
 * Final fallback: URL extension heuristics. This only fires for
 * exotic requests where destination isn't available (e.g. some
 * runtime-injected fetches).
 */
export function inferResourceType(
  request: { url?: string; method?: string },
  context: unknown,
): ResourceType {
  const ctx = context as
    | {
        parsed?: { url?: URL; destination?: string };
        request?: { rawDestination?: string };
        rawrequest?: { destination?: string };
      }
    | undefined;

  const dest =
    ctx?.parsed?.destination ??
    ctx?.request?.rawDestination ??
    ctx?.rawrequest?.destination ??
    '';

  switch (dest) {
    case 'document':
      return 'main_frame';
    case 'iframe':
    case 'frame':
      return 'sub_frame';
    case 'script':
    case 'worker':
    case 'serviceworker':
    case 'sharedworker':
      return 'script';
    case 'style':
      return 'stylesheet';
    case 'image':
      return 'image';
    case 'font':
      return 'font';
    case 'object':
    case 'embed':
      return 'object';
    case 'audio':
    case 'video':
    case 'track':
      return 'media';
    case 'fetch':
    case 'xhr':
    case 'xmlhttprequest':
      return 'xmlhttprequest';
    case 'websocket':
      return 'websocket';
    case 'ping':
      return 'ping';
    case 'report':
    case 'csp_report':
      return 'csp_report';
    default:
      break;
  }

  // URL heuristics fallback.
  const url = request.url ?? ctx?.parsed?.url?.toString() ?? '';
  if (/\.(css)(\?|#|$)/i.test(url)) return 'stylesheet';
  if (/\.(js|mjs)(\?|#|$)/i.test(url)) return 'script';
  if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)(\?|#|$)/i.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(url)) return 'font';

  return 'other';
}

/**
 * Minimal shape we need from TabResolver — the host plugin injects
 * its NyxBridge tab resolver to map a Scramjet frame element to a
 * DDX tab id. We don't type-couple to the resolver class because
 * webRequest lives under `src/core/helium/host/` and shouldn't reach
 * back into the higher-level `src/apis/nyxBridge` module structure.
 */
export interface TabResolverDep {
  /** Reverse-lookup: iframe element → DDX numeric tab id, or -1. */
  toNumFromIframe(iframe: HTMLIFrameElement): number;
}

/**
 * Per-frame deps injected into the dispatcher. The plugin owns the
 * Scramjet Frame at install time and forwards `frame.element` plus
 * the shared `tabResolver` on each tap.
 */
export interface FrameContext {
  /**
   * The Scramjet frame's iframe element. Used to derive the real DDX
   * `tabId` via `TabResolver.toNumFromIframe`. When the plugin can't
   * provide one (e.g. an error path before frame.install completes)
   * tabId falls through to -1.
   */
  frameElement?: HTMLIFrameElement;
  tabResolver?: TabResolverDep;
}

/**
 * Pull tabId / frameId / windowId for a webRequest event.
 *
 * - tabId: derived from `frame.element` via TabResolver.
 *   Scramjet doesn't track DDX tab identity; the resolver owns that
 *   map. Returns -1 when no element / resolver / mapping is available.
 * - frameId: always 0 for v1 (top-frame only). chrome.webRequest's
 *   sub_frame frameId tracking would require Scramjet to expose an
 *   index for nested frames inside a single proxied document, which
 *   is deferred (helium-t1-3).
 * - parentFrameId: -1 for top-frame (Chrome convention).
 * - documentId / initiator: lifted from `context.parsed` when present.
 */
export function getFrameMeta(
  context: unknown,
  frame?: FrameContext,
): {
  tabId: number;
  frameId: number;
  parentFrameId: number;
  windowId: number;
  documentId?: string;
  initiator?: string;
} {
  // chrome.webRequest's parsed surface — Scramjet stores fetch
  // origin/initiator info on `context.parsed` (see
  // ScramjetFetchParsed). We probe defensively because the error
  // hook gives a different context shape.
  const ctx = context as
    | {
        parsed?: {
          fetchInitiatorOrigin?: string;
          clientUrl?: { origin?: string };
        };
        request?: { url?: string };
        documentId?: string;
      }
    | undefined;

  let tabId = -1;
  if (frame?.tabResolver && frame.frameElement) {
    try {
      tabId = frame.tabResolver.toNumFromIframe(frame.frameElement);
    } catch {
      tabId = -1;
    }
  }

  const out: {
    tabId: number;
    frameId: number;
    parentFrameId: number;
    windowId: number;
    documentId?: string;
    initiator?: string;
  } = {
    tabId,
    // v1: top-frame only. chrome.webRequest's "frameId == 0"
    // canonically means "main frame", so this matches contract.
    frameId: 0,
    parentFrameId: -1,
    // DDX uses a single window for v1.
    windowId: 1,
  };

  if (typeof ctx?.documentId === 'string') out.documentId = ctx.documentId;
  const init =
    ctx?.parsed?.fetchInitiatorOrigin ?? ctx?.parsed?.clientUrl?.origin;
  if (typeof init === 'string') out.initiator = init;
  return out;
}

// --- BlockingResponse merge ------------------------------------

export interface BlockingResponse {
  cancel?: boolean;
  redirectUrl?: string;
  requestHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
  responseHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
  authCredentials?: { username: string; password: string };
}

/**
 * Merge a sequence of blocking responses per Chrome semantics:
 *   - First `cancel: true` short-circuits and wins.
 *   - First non-empty `redirectUrl` wins.
 *   - `requestHeaders` / `responseHeaders`: last writer wins per name,
 *     in iteration order. We flatten on the canonical name (case-
 *     insensitive); the resulting array preserves the latest values.
 */
export function mergeBlockingResponses(
  responses: BlockingResponse[],
): BlockingResponse {
  const merged: BlockingResponse = {};
  let mergedReqHeaders: Array<{ name: string; value?: string; binaryValue?: number[] }> | null = null;
  let mergedResHeaders: Array<{ name: string; value?: string; binaryValue?: number[] }> | null = null;

  for (const r of responses) {
    if (!r || typeof r !== 'object') continue;
    if (r.cancel) {
      merged.cancel = true;
      // Per spec: don't bother merging once a cancel wins.
      return merged;
    }
    if (!merged.redirectUrl && typeof r.redirectUrl === 'string') {
      merged.redirectUrl = r.redirectUrl;
    }
    if (Array.isArray(r.requestHeaders)) {
      mergedReqHeaders = mergeHeadersList(mergedReqHeaders, r.requestHeaders);
    }
    if (Array.isArray(r.responseHeaders)) {
      mergedResHeaders = mergeHeadersList(mergedResHeaders, r.responseHeaders);
    }
    if (r.authCredentials && !merged.authCredentials) {
      merged.authCredentials = r.authCredentials;
    }
  }

  if (mergedReqHeaders) merged.requestHeaders = mergedReqHeaders;
  if (mergedResHeaders) merged.responseHeaders = mergedResHeaders;
  return merged;
}

function mergeHeadersList(
  base: Array<{ name: string; value?: string; binaryValue?: number[] }> | null,
  patch: Array<{ name: string; value?: string; binaryValue?: number[] }>,
): Array<{ name: string; value?: string; binaryValue?: number[] }> {
  // Use insertion-ordered Map keyed on lowercase name.
  const map = new Map<string, { name: string; value?: string; binaryValue?: number[] }>();
  if (base) {
    for (const h of base) map.set(h.name.toLowerCase(), h);
  }
  for (const h of patch) map.set(h.name.toLowerCase(), h);
  return Array.from(map.values());
}

// --- Dispatcher core -------------------------------------------

export interface RequestDetails {
  requestId: string;
  url: string;
  method: string;
  frameId: number;
  parentFrameId: number;
  tabId: number;
  type: ResourceType;
  timeStamp: number;
  initiator?: string;
  documentId?: string;
  documentLifecycle?: 'active';
  frameType?: 'outermost_frame' | 'fenced_frame' | 'sub_frame';
  requestHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
  responseHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
  statusCode?: number;
  statusLine?: string;
  fromCache?: boolean;
  ip?: string;
  error?: string;
  redirectUrl?: string;
}

/**
 * Build the canonical chrome.webRequest details for a given Scramjet
 * tap invocation. Optional fields are added only when their value is
 * not the default sentinel, to keep payloads compact across IPC.
 *
 * `frame` carries the iframe element + TabResolver so the dispatcher
 * can compute the real DDX `tabId` (rather than a -1 placeholder).
 * When absent (e.g. unit tests or pre-install paths), tabId falls
 * through to -1, matching chrome.webRequest's "no tab" sentinel.
 */
export function buildRequestDetails(
  request: { url?: string; method?: string },
  context: unknown,
  reqObj: object,
  extras: {
    requestHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
    responseHeaders?: Array<{ name: string; value?: string; binaryValue?: number[] }>;
    statusCode?: number;
    statusLine?: string;
    fromCache?: boolean;
    ip?: string;
    error?: string;
    redirectUrl?: string;
  } = {},
  frame?: FrameContext,
): RequestDetails {
  const meta = getFrameMeta(context, frame);
  const url = request.url ?? '';
  const method = (request.method ?? 'GET').toUpperCase();
  const type = inferResourceType(request, context);
  const details: RequestDetails = {
    requestId: getOrAssignRequestId(reqObj),
    url,
    method,
    frameId: meta.frameId,
    parentFrameId: meta.parentFrameId,
    tabId: meta.tabId,
    type,
    timeStamp: Date.now(),
  };
  if (meta.initiator) details.initiator = meta.initiator;
  if (meta.documentId) details.documentId = meta.documentId;
  details.documentLifecycle = 'active';
  details.frameType =
    type === 'main_frame'
      ? 'outermost_frame'
      : type === 'sub_frame'
      ? 'sub_frame'
      : 'outermost_frame';

  if (extras.requestHeaders) details.requestHeaders = extras.requestHeaders;
  if (extras.responseHeaders) details.responseHeaders = extras.responseHeaders;
  if (typeof extras.statusCode === 'number') details.statusCode = extras.statusCode;
  if (typeof extras.statusLine === 'string') details.statusLine = extras.statusLine;
  if (typeof extras.fromCache === 'boolean') details.fromCache = extras.fromCache;
  if (typeof extras.ip === 'string') details.ip = extras.ip;
  if (typeof extras.error === 'string') details.error = extras.error;
  if (typeof extras.redirectUrl === 'string') details.redirectUrl = extras.redirectUrl;

  return details;
}

/**
 * Generic dispatcher.
 *   - Blocking: awaits each matching subscriber and merges responses.
 *   - Observer: fires asynchronously (returns immediately).
 *
 * Returns the merged BlockingResponse so callers can apply it to
 * `props`.
 */
export async function dispatchEvent(
  registry: WebRequestRegistry,
  event: WebRequestEvent,
  details: RequestDetails,
  opts: { blocking: boolean; perListenerTimeoutMs?: number } = {
    blocking: false,
  },
): Promise<BlockingResponse> {
  const subs = registry.forEvent(event);
  if (subs.length === 0) return {};

  const filterReq: FilterableRequest = {
    url: details.url,
    type: details.type,
    tabId: details.tabId,
  };

  const matched = subs.filter((s) => matchesRequest(s.filter, filterReq));
  if (matched.length === 0) return {};

  if (!opts.blocking) {
    // Observer: fire-and-forget, no merge.
    for (const sub of matched) {
      void Promise.resolve()
        .then(() => sub.listener(details as unknown as Record<string, unknown>))
        .catch((err: unknown) => {
          console.warn(
            `[helium/webRequest] observer ${event} for ${sub.extId} threw:`,
            err,
          );
        });
    }
    return {};
  }

  // Blocking: await all matching subscribers concurrently, with
  // per-listener timeout. Then merge.
  const timeoutMs = opts.perListenerTimeoutMs ?? 5000;
  const settled = await Promise.allSettled(
    matched.map(async (sub) => {
      // Respect each subscriber's blocking flag — non-blocking
      // listeners under the same event surface get fired but their
      // return value is ignored.
      const result = sub.listener(details as unknown as Record<string, unknown>);
      if (result == null) return undefined;
      if (typeof (result as { then?: unknown }).then === 'function') {
        return withTimeout(
          result as Promise<unknown>,
          timeoutMs,
          `webRequest ${event} listener for ${sub.extId}`,
        );
      }
      return result;
    }),
  );

  const responses: BlockingResponse[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    const sub = matched[i]!;
    if (r.status === 'rejected') {
      console.warn(
        `[helium/webRequest] blocking listener ${event} for ${sub.extId} rejected:`,
        r.reason,
      );
      continue;
    }
    if (sub.isBlocking && r.value && typeof r.value === 'object') {
      responses.push(r.value as BlockingResponse);
    }
  }

  return mergeBlockingResponses(responses);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`Timeout (${ms}ms): ${label}`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
