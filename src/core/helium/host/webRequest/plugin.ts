
import type { WebRequestRegistry } from './registry';
import {
  type FrameContext,
  type RequestDetails,
  type TabResolverDep,
  buildRequestDetails,
  dispatchEvent,
} from './events';
import type { DnrEngineFacade, DnrModifyHeadersQueue } from './dnr-bridge';

interface PluginDeps {
  registry: WebRequestRegistry;
  /**
   * Optional DNR bridge. If provided, the plugin will call
   * `dnr.evaluate(details)` at intercept time and apply the result.
   * Implemented in dnr-bridge.ts (Task 29).
   */
  dnr?: DnrEngineFacade | null;
  /**
   * Optional observer fired on fetch.response, in addition to the
   * normal `onCompleted` dispatch. Used by the chrome.devtools.network
   * fan-out so devtools_page iframes can subscribe to onRequestFinished.
   * Receives the same RequestDetails as the onCompleted event.
   */
  onResponseObserver?: ((details: RequestDetails) => void) | null;
  /**
   * Resolver used to map the Scramjet Frame's iframe element back to
   * a DDX numeric tabId. Without it, every emitted RequestDetails
   * would carry tabId=-1, which collapses tab-filtered listeners
   * (chrome.webRequest filters with explicit `tabId`).
   */
  tabResolver?: TabResolverDep | null;
}

interface RequestState {
  dnrRequestHeaders?: DnrModifyHeadersQueue;
  dnrResponseHeaders?: DnrModifyHeadersQueue;
  dnrShortCircuited?: boolean;
}

const requestState = new WeakMap<object, RequestState>();

function getState(reqObj: object): RequestState {
  let s = requestState.get(reqObj);
  if (!s) {
    s = {};
    requestState.set(reqObj, s);
  }
  return s;
}

type RawHeaders = [string, string][];

interface ScramjetHeadersLike {
  headers: Record<string, string>;
  set(key: string, v: string): void;
  get(key: string): string | null;
  delete(key: string): void;
  has(key: string): boolean;
  toRawHeaders(): RawHeaders;
}

interface ScramjetHeadersCtor {
  new (): ScramjetHeadersLike;
  fromRawHeaders(raw: RawHeaders): ScramjetHeadersLike;
}

/** Mirrors ScramjetFetchResponse (fetch/index.ts:68). */
interface ScramjetFetchResponseLike {
  body: BodyInit | null;
  headers: ScramjetHeadersLike;
  status: number;
  statusText: string;
}

/**
 * Mirrors BareResponse (proxy-transports client.d.ts:7). Extends
 * Response with `rawHeaders: RawHeaders` and `url: string`.
 *
 * Note: at preresponse stage, `headers` is the immutable Response.headers
 * (Headers instance) — the mutable wire-format is on `rawHeaders`.
 */
interface BareResponseLike extends Response {
  rawHeaders: RawHeaders;
}

interface BareResponseCtor {
  fromNativeResponse(resp: Response): BareResponseLike;
}

/** Mirrors BareRequestInit (proxy-transports client.d.ts:14). */
interface BareRequestInitLike {
  body?: BodyInit | null;
  headers?: RawHeaders;
  method?: string;
  redirect?: RequestRedirect;
  maxRedirects?: number;
}

interface InterceptProps {
  response?: ScramjetFetchResponseLike;
}

interface RequestProps {
  init: BareRequestInitLike;
  url: URL;
  earlyResponse?: BareResponseLike | Response;
}

interface PreresponseProps {
  response: BareResponseLike;
}

interface ResponseProps {
  response: ScramjetFetchResponseLike;
}

interface ScramjetGlobals {
  Plugin?: new (id: string) => {
    tap: (hook: unknown, fn: unknown) => void;
  };
  BareResponse?: BareResponseCtor;
  ScramjetHeaders?: ScramjetHeadersCtor;
}

function getScramjet(): ScramjetGlobals | null {
  const g = globalThis as unknown as { $scramjet?: ScramjetGlobals };
  return g.$scramjet ?? null;
}

/** Frame shape we touch — element + the fetch/error hook surface. */
interface ScramjetFrameLike {
  element: HTMLIFrameElement;
  hooks?: {
    fetch?: {
      intercept?: unknown;
      request?: unknown;
      preresponse?: unknown;
      response?: unknown;
    };
    error?: { request?: unknown };
  };
}

export class WebRequestPlugin {
  public readonly name = 'helium-webRequest';
  public readonly dependencies: string[] = [];

  private readonly registry: WebRequestRegistry;
  private readonly dnr: DnrEngineFacade | null;
  private readonly onResponseObserver: ((details: RequestDetails) => void) | null;
  private readonly tabResolver: TabResolverDep | null;
  private inner: { tap: (hook: unknown, fn: unknown) => void } | null = null;
  private frame: ScramjetFrameLike | null = null;

  constructor(deps: PluginDeps) {
    this.registry = deps.registry;
    this.dnr = deps.dnr ?? null;
    this.onResponseObserver = deps.onResponseObserver ?? null;
    this.tabResolver = deps.tabResolver ?? null;
  }

  install(frame: unknown): void {
    const sj = getScramjet();
    const Plugin = sj?.Plugin;
    if (!Plugin) {
      console.warn(
        '[helium/webRequest] $scramjet not initialised; plugin not installed',
      );
      return;
    }
    if (!this.inner) this.inner = new Plugin('helium-webRequest');

    const f = frame as ScramjetFrameLike;
    this.frame = f;

    const hooks = f.hooks;
    if (!hooks) {
      console.warn('[helium/webRequest] frame has no hooks; skipping');
      return;
    }

    const tap = this.inner.tap;
    if (typeof tap !== 'function') {
      console.warn('[helium/webRequest] plugin has no tap fn; skipping');
      return;
    }
    const tapFn = tap.bind(this.inner);

    if (hooks.fetch?.intercept) {
      tapFn(hooks.fetch.intercept, async (context: unknown, props: unknown) => {
        await this.onIntercept(context, props as InterceptProps);
      });
    }
    if (hooks.fetch?.request) {
      tapFn(hooks.fetch.request, async (context: unknown, props: unknown) => {
        await this.onRequest(context, props as RequestProps);
      });
    }
    if (hooks.fetch?.preresponse) {
      tapFn(hooks.fetch.preresponse, async (context: unknown, props: unknown) => {
        await this.onPreresponse(context, props as PreresponseProps);
      });
    }
    if (hooks.fetch?.response) {
      tapFn(hooks.fetch.response, async (context: unknown, props: unknown) => {
        await this.onResponse(context, props as ResponseProps);
      });
    }
    if (hooks.error?.request) {
      tapFn(hooks.error.request, async (context: unknown, props: unknown) => {
        await this.onError(context, props);
      });
    }
  }

  private async onIntercept(context: unknown, props: InterceptProps): Promise<void> {
    const reqObj = (context as { request?: object } | undefined)?.request;
    if (!reqObj || typeof reqObj !== 'object') return;
    const state = getState(reqObj);

    const details = this.buildDetails(context, reqObj as object);

    if (this.dnr) {
      try {
        const dnrResult = await this.dnr.evaluate(details);
        if (dnrResult) {
          if (dnrResult.kind === 'block') {
            setInterceptResponse(props, blockInterceptResponse());
            state.dnrShortCircuited = true;
            return;
          }
          if (dnrResult.kind === 'redirect' && dnrResult.url) {
            setInterceptResponse(props, redirectInterceptResponse(dnrResult.url));
            state.dnrShortCircuited = true;
            return;
          }
          if (dnrResult.kind === 'upgradeScheme') {
            const upgraded = upgradeSchemeOf(details.url);
            if (upgraded) {
              setInterceptResponse(props, redirectInterceptResponse(upgraded));
            }
            state.dnrShortCircuited = true;
            return;
          }
          if (dnrResult.kind === 'allow' || dnrResult.kind === 'allowAllRequests') {
            state.dnrShortCircuited = true;
          } else if (dnrResult.kind === 'modifyHeaders') {
            if (dnrResult.requestHeaders) {
              state.dnrRequestHeaders = dnrResult.requestHeaders;
            }
            if (dnrResult.responseHeaders) {
              state.dnrResponseHeaders = dnrResult.responseHeaders;
            }
          }
        }
      } catch (err) {
        console.warn('[helium/webRequest] DNR evaluation failed:', err);
      }
    }

    if (!state.dnrShortCircuited) {
      const response = await dispatchEvent(this.registry, 'onBeforeRequest', details, {
        blocking: true,
      });
      if (response.cancel) {
        setInterceptResponse(props, blockInterceptResponse());
        state.dnrShortCircuited = true;
        return;
      }
      if (response.redirectUrl) {
        setInterceptResponse(props, redirectInterceptResponse(response.redirectUrl));
        state.dnrShortCircuited = true;
        return;
      }
    }
  }

  private async onRequest(context: unknown, props: RequestProps): Promise<void> {
    const reqObj = (context as { request?: object } | undefined)?.request;
    if (!reqObj || typeof reqObj !== 'object') return;
    const state = getState(reqObj);

    const headers = rawHeadersToWebRequestArray(props.init?.headers);
    const details = this.buildDetails(context, reqObj as object, {
      ...(headers ? { requestHeaders: headers } : {}),
    });

    if (!state.dnrShortCircuited) {
      const response = await dispatchEvent(
        this.registry,
        'onBeforeSendHeaders',
        details,
        { blocking: true },
      );
      if (response.cancel) {
        props.earlyResponse = blockNativeResponse();
        state.dnrShortCircuited = true;
        return;
      }
      if (response.requestHeaders) {
        applyRequestHeadersToInit(props, response.requestHeaders);
      }
    }

    if (state.dnrRequestHeaders) {
      applyDnrRequestHeaders(props, state.dnrRequestHeaders);
    }

    const finalHeaders = rawHeadersToWebRequestArray(props.init?.headers);
    const obsDetails = this.buildDetails(context, reqObj as object, {
      ...(finalHeaders ? { requestHeaders: finalHeaders } : {}),
    });
    void dispatchEvent(this.registry, 'onSendHeaders', obsDetails, {
      blocking: false,
    });
  }

  private async onPreresponse(
    context: unknown,
    props: PreresponseProps,
  ): Promise<void> {
    const reqObj = (context as { request?: object } | undefined)?.request;
    if (!reqObj || typeof reqObj !== 'object') return;
    const state = getState(reqObj);

    const responseHeaders = rawHeadersToWebRequestArray(props.response?.rawHeaders);
    const statusCode = props.response?.status;
    const statusLine = makeStatusLine(props.response);

    const baseExtras: {
      responseHeaders?: typeof responseHeaders;
      statusCode?: number;
      statusLine?: string;
    } = {};
    if (responseHeaders) baseExtras.responseHeaders = responseHeaders;
    if (typeof statusCode === 'number') baseExtras.statusCode = statusCode;
    if (typeof statusLine === 'string') baseExtras.statusLine = statusLine;

    const details = this.buildDetails(context, reqObj as object, baseExtras);

    if (!state.dnrShortCircuited) {
      const response = await dispatchEvent(
        this.registry,
        'onHeadersReceived',
        details,
        { blocking: true },
      );
      if (response.cancel) {
        const bare = makeBareResponse(blockNativeResponse());
        if (bare) props.response = bare;
        return;
      }
      if (response.redirectUrl) {
        const bare = makeBareResponse(redirectNativeResponse(response.redirectUrl));
        if (bare) props.response = bare;
        return;
      }
      if (response.responseHeaders) {
        applyResponseHeadersToPreresponse(props, response.responseHeaders);
      }
    }

    if (state.dnrResponseHeaders) {
      applyDnrPreresponseHeaders(props, state.dnrResponseHeaders);
    }

    void dispatchEvent(this.registry, 'onResponseStarted', details, {
      blocking: false,
    });

    const location = findHeader(responseHeaders, 'location');
    if (location && statusCode && statusCode >= 300 && statusCode < 400) {
      const redirectDetails = this.buildDetails(context, reqObj as object, {
        ...baseExtras,
        redirectUrl: location,
      });
      void dispatchEvent(this.registry, 'onBeforeRedirect', redirectDetails, {
        blocking: false,
      });
    }
  }

  private async onResponse(context: unknown, props: ResponseProps): Promise<void> {
    const reqObj = (context as { request?: object } | undefined)?.request;
    if (!reqObj || typeof reqObj !== 'object') return;

    const responseHeaders = scramjetHeadersToArray(props.response?.headers);
    const statusCode = props.response?.status;
    const statusLine = makeStatusLine(props.response);

    const extras: {
      responseHeaders?: typeof responseHeaders;
      statusCode?: number;
      statusLine?: string;
    } = {};
    if (responseHeaders) extras.responseHeaders = responseHeaders;
    if (typeof statusCode === 'number') extras.statusCode = statusCode;
    if (typeof statusLine === 'string') extras.statusLine = statusLine;

    const details = this.buildDetails(context, reqObj as object, extras);
    void dispatchEvent(this.registry, 'onCompleted', details, {
      blocking: false,
    });
    if (this.onResponseObserver) {
      try { this.onResponseObserver(details); } catch (err) {
        console.warn('[helium/webRequest] devtools onResponse hook threw:', err);
      }
    }
  }

  private async onError(context: unknown, props: unknown): Promise<void> {
    const ctx = context as
      | { rawrequest?: { rawUrl?: string; method?: string }; error?: unknown }
      | undefined;
    const rawreq = ctx?.rawrequest;
    if (!rawreq || typeof rawreq !== 'object') return;
    const err = (props as { error?: unknown } | undefined)?.error ?? ctx?.error;
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
    const details = buildRequestDetails(
      { url: rawreq.rawUrl, method: rawreq.method },
      context,
      rawreq as object,
      { error: message },
      this.makeFrameContext(),
    );
    void dispatchEvent(this.registry, 'onErrorOccurred', details, {
      blocking: false,
    });
  }

  private buildDetails(
    context: unknown,
    reqObj: object,
    extras: Parameters<typeof buildRequestDetails>[3] = {},
  ): RequestDetails {
    const req = (context as { request?: { url?: string; method?: string } } | undefined)
      ?.request ?? {};
    return buildRequestDetails(req, context, reqObj, extras, this.makeFrameContext());
  }

  private makeFrameContext(): FrameContext | undefined {
    if (!this.frame || !this.tabResolver) return undefined;
    return {
      frameElement: this.frame.element,
      tabResolver: this.tabResolver,
    };
  }
}

/** intercept blocking: `props.response: ScramjetFetchResponse`. */
function setInterceptResponse(
  props: InterceptProps,
  resp: ScramjetFetchResponseLike,
): void {
  props.response = resp;
}

function makeScramjetHeaders(entries: RawHeaders): ScramjetHeadersLike {
  const SH = getScramjet()?.ScramjetHeaders;
  if (SH) return SH.fromRawHeaders(entries);
  const map: Record<string, string> = {};
  for (const [k, v] of entries) map[k.toLowerCase()] = v;
  return {
    headers: map,
    set(k: string, v: string) { map[k.toLowerCase()] = v; },
    get(k: string) { return map[k.toLowerCase()] ?? null; },
    delete(k: string) { delete map[k.toLowerCase()]; },
    has(k: string) { return k.toLowerCase() in map; },
    toRawHeaders(): RawHeaders {
      return Object.entries(map);
    },
  };
}

function blockInterceptResponse(): ScramjetFetchResponseLike {
  return {
    body: '',
    headers: makeScramjetHeaders([
      ['content-type', 'text/plain; charset=utf-8'],
    ]),
    status: 403,
    statusText: 'Blocked',
  };
}

function redirectInterceptResponse(url: string): ScramjetFetchResponseLike {
  return {
    body: '',
    headers: makeScramjetHeaders([['location', url]]),
    status: 302,
    statusText: 'Found',
  };
}

/** request blocking: `props.earlyResponse: BareResponse|Response`. */
function blockNativeResponse(): Response {
  return new Response('', {
    status: 403,
    statusText: 'Blocked',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function redirectNativeResponse(url: string): Response {
  return new Response('', {
    status: 302,
    statusText: 'Found',
    headers: { location: url },
  });
}

/**
 * Convert a native Response into a BareResponse so we can replace
 * `preresponse.props.response` (which is typed as BareResponse and
 * may be inspected for `.rawHeaders` by downstream Scramjet logic).
 */
function makeBareResponse(resp: Response): BareResponseLike | null {
  const BR = getScramjet()?.BareResponse;
  if (BR) return BR.fromNativeResponse(resp);
  return null;
}

function upgradeSchemeOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:') {
      u.protocol = 'https:';
      return u.toString();
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Convert RawHeaders ([name, value][]) to chrome.webRequest's array
 * shape ({name, value}[]). RawHeaders preserves duplicates; the
 * chrome.webRequest shape does too. Case is preserved as-given by
 * Scramjet.
 */
function rawHeadersToWebRequestArray(
  raw: RawHeaders | undefined,
): Array<{ name: string; value?: string; binaryValue?: number[] }> | undefined {
  if (!raw) return undefined;
  const out: Array<{ name: string; value?: string; binaryValue?: number[] }> = [];
  for (const pair of raw) {
    if (Array.isArray(pair) && pair.length >= 2) {
      out.push({ name: String(pair[0]), value: String(pair[1]) });
    }
  }
  return out;
}

/**
 * Iterate a ScramjetHeaders into the webRequest array shape.
 * ScramjetHeaders coalesces duplicate names (last-write-wins) so the
 * round-trip is lossy if upstream had repeated header names; that
 * matches Scramjet's own contract since it stores them in a plain
 * object.
 */
function scramjetHeadersToArray(
  h: ScramjetHeadersLike | undefined,
): Array<{ name: string; value?: string; binaryValue?: number[] }> | undefined {
  if (!h) return undefined;
  const out: Array<{ name: string; value?: string; binaryValue?: number[] }> = [];
  const raw = h.toRawHeaders();
  for (const [name, value] of raw) {
    out.push({ name, value });
  }
  return out;
}

function webRequestArrayToRawHeaders(
  headers: Array<{ name: string; value?: string; binaryValue?: number[] }>,
): RawHeaders {
  const out: RawHeaders = [];
  for (const h of headers) {
    if (typeof h.value === 'string') out.push([h.name, h.value]);
  }
  return out;
}

/** request: replace `props.init.headers: RawHeaders`. */
function applyRequestHeadersToInit(
  props: RequestProps,
  headers: Array<{ name: string; value?: string; binaryValue?: number[] }>,
): void {
  if (!props.init) return;
  props.init.headers = webRequestArrayToRawHeaders(headers);
}

/** preresponse: replace `props.response.rawHeaders: RawHeaders`. */
function applyResponseHeadersToPreresponse(
  props: PreresponseProps,
  headers: Array<{ name: string; value?: string; binaryValue?: number[] }>,
): void {
  if (!props.response) return;
  props.response.rawHeaders = webRequestArrayToRawHeaders(headers);
}

function applyDnrRequestHeaders(
  props: RequestProps,
  queue: DnrModifyHeadersQueue,
): void {
  const cur = rawHeadersToWebRequestArray(props.init?.headers) ?? [];
  const next = applyHeaderOps(cur, queue);
  applyRequestHeadersToInit(props, next);
}

function applyDnrPreresponseHeaders(
  props: PreresponseProps,
  queue: DnrModifyHeadersQueue,
): void {
  const cur = rawHeadersToWebRequestArray(props.response?.rawHeaders) ?? [];
  const next = applyHeaderOps(cur, queue);
  applyResponseHeadersToPreresponse(props, next);
}

function applyHeaderOps(
  headers: Array<{ name: string; value?: string; binaryValue?: number[] }>,
  queue: DnrModifyHeadersQueue,
): Array<{ name: string; value?: string; binaryValue?: number[] }> {
  const map = new Map<string, { name: string; value?: string }>();
  for (const h of headers) map.set(h.name.toLowerCase(), { name: h.name, value: h.value });
  for (const op of queue) {
    const key = op.header.toLowerCase();
    if (op.operation === 'remove') {
      map.delete(key);
    } else if (op.operation === 'set') {
      map.set(key, { name: op.header, value: op.value ?? '' });
    } else if (op.operation === 'append') {
      const cur = map.get(key);
      const v = cur?.value ? `${cur.value}, ${op.value ?? ''}` : op.value ?? '';
      map.set(key, { name: op.header, value: v });
    }
  }
  return Array.from(map.values());
}

function makeStatusLine(resp: { status?: number; statusText?: string } | undefined): string | undefined {
  if (!resp || typeof resp.status !== 'number') return undefined;
  const text = resp.statusText ?? '';
  return `HTTP/1.1 ${resp.status} ${text}`.trim();
}

function findHeader(
  headers:
    | Array<{ name: string; value?: string; binaryValue?: number[] }>
    | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lc = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lc) return h.value;
  }
  return undefined;
}
