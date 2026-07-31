/**
 * DdxErrorPagePlugin — renders the DDX error page for failed proxied
 * navigations directly from the Scramjet fetch pipeline.
 *
 * Two hook points are used:
 *   - `frame.hooks.fetch.preresponse` — fires for every response before
 *     it reaches the page. Navigation responses with a 4xx/5xx status
 *     are turned into an error render. This tap is READ-ONLY: it never
 *     touches `props.response`, so it cannot conflict with the download
 *     interception plugin which shares the same hook.
 *   - `frame.hooks.fetch.error` — fires when the fetch itself throws
 *     (DNS failure, timeout, transport error). The hook is optional in
 *     the vendored controller, so the tap is best-effort.
 *
 * The plugin does not navigate. It hands a structured `ErrorPageContext`
 * to the host callback, which renders it inline via `iframe.srcdoc`.
 */

export type ErrorPageErrorType =
  | 'dns'
  | 'timeout'
  | 'proxy'
  | 'http_error'
  | 'blocked'
  | 'unknown';

export interface ErrorPageContext {
  originalUrl: string;
  status: number;
  statusText: string;
  errorType: ErrorPageErrorType;
  message: string;
  stack?: string;
  requestId: string;
  timestamp: number;
}

interface FetchContextLike {
  request?: {
    rawDestination?: string;
    destination?: string;
  };
  parsed?: { url?: URL };
}

interface PreresponseProps {
  response?: { status?: number; statusText?: string; headers?: Headers };
}

interface ErrorProps {
  error?: unknown;
}

export interface ErrorPluginFrameLike {
  hooks: {
    fetch: {
      preresponse: unknown;
      /** Scramjet v2 puts the transport-error hook here (nested under fetch). */
      error?: unknown;
    };
    /** Scramjet v1 / DDX controller puts the transport-error hook here. */
    error?: {
      request?: unknown;
    };
  };
}

function isNavigationDestination(dest: string | undefined): boolean {
  return dest === 'document' || dest === 'iframe';
}

function newRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(16).slice(2, 10);
  }
}

/** Map a thrown transport error onto a coarse error type. */
export function classifyTransportError(err: unknown): ErrorPageErrorType {
  const msg = (
    (err as { message?: string } | null)?.message ??
    String(err ?? '')
  ).toLowerCase();
  if (!msg) return 'unknown';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (
    msg.includes('dns') ||
    msg.includes('enotfound') ||
    msg.includes('name not resolved') ||
    msg.includes('getaddrinfo')
  ) {
    return 'dns';
  }
  if (
    msg.includes('blocked') ||
    msg.includes('refused') ||
    msg.includes('forbidden')
  ) {
    return 'blocked';
  }
  // libcurl error 52: server returned nothing (no headers, no data).
  // Treat as a proxy-level failure rather than unknown.
  if (
    msg.includes('error code 52') ||
    msg.includes('server returned nothing') ||
    msg.includes('no headers, no data')
  ) {
    return 'proxy';
  }
  return 'proxy';
}

/** Map an HTTP status onto a coarse error type. */
export function classifyHttpStatus(status: number): ErrorPageErrorType {
  if (status === 403 || status === 451) return 'blocked';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 502 || status === 503) return 'proxy';
  return 'http_error';
}

export type ErrorPageRenderer = (context: ErrorPageContext) => void;

export class DdxErrorPagePlugin {
  public readonly name = 'ddx-error-page';
  public readonly dependencies: string[] = [];

  constructor(private readonly render: ErrorPageRenderer) {}

  install(frame: ErrorPluginFrameLike): void {
    // $scramjet.Plugin is only available inside proxied-frame JS contexts, not
    // in the main page. Tap directly onto the TapInstance internal structure
    // instead — this is what Plugin.tap() does under the hood.
    const tapDirect = (hook: unknown, fn: (...args: unknown[]) => unknown) => {
      const internal = hook as {
        tap?: { callbacks?: Record<string, { callback: (...a: unknown[]) => unknown; plugin: { name: string; tapOrder: object }; order: object }[]> };
        key?: string;
      };
      if (!internal?.tap?.callbacks || !internal.key) {
        console.warn('[tabs/errorPlugin] hook is not a TapInstance — cannot register');
        return;
      }
      const cbs = internal.tap.callbacks;
      if (!cbs[internal.key]) cbs[internal.key] = [];
      cbs[internal.key]!.push({
        callback: fn as (...a: unknown[]) => unknown,
        plugin: { name: 'ddx-error-page', tapOrder: {} },
        order: {},
      });
    };

    tapDirect(frame.hooks.fetch.preresponse, (ctxArg: unknown, propsArg: unknown) => {
      try {
        const ctx = ctxArg as FetchContextLike;
        const props = propsArg as PreresponseProps;

        const dest = ctx.request?.rawDestination ?? ctx.request?.destination;
        if (!isNavigationDestination(dest)) return;

        const status = props.response?.status ?? 0;
        if (status < 400) return;

        const url = ctx.parsed?.url?.href ?? '';
        const statusText = props.response?.statusText ?? '';

        this.render({
          originalUrl: url,
          status,
          statusText,
          errorType: classifyHttpStatus(status),
          message: statusText
            ? `${status} ${statusText}`
            : `Server responded with status ${status}`,
          requestId: newRequestId(),
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('[tabs/errorPlugin] preresponse handler failed:', err);
      }
    });

    // The transport-error hook lives at different paths depending on the
    // controller version: Scramjet v2 uses frame.hooks.fetch.error, DDX's
    // own controller uses frame.hooks.error.request.
    const errorHook =
      frame.hooks.error?.request ?? frame.hooks.fetch.error;
    if (!errorHook) {
      return;
    }

    tapDirect(errorHook, (ctxArg: unknown, propsArg: unknown) => {
      try {
        // DDX controller error hook context shape:
        //   { rawrequest: TransferRequest, error: unknown }
        // Scramjet v2 error hook context shape:
        //   { request: { rawDestination, destination }, parsed: { url } }
        const ctx = ctxArg as {
          rawrequest?: { destination?: string; rawDestination?: string; rawUrl?: string };
          request?: { rawDestination?: string; destination?: string };
          parsed?: { url?: URL };
          error?: unknown;
        };
        const props = propsArg as ErrorProps & { suppressError?: boolean; setResponse?: unknown };

        // Pull the error from whichever location it appears.
        const err = (ctx.error ?? props?.error) as unknown;

        // Destination lives on rawrequest (DDX) or request (SJ v2).
        const dest =
          ctx.rawrequest?.rawDestination ??
          ctx.rawrequest?.destination ??
          ctx.request?.rawDestination ??
          ctx.request?.destination;
        if (!isNavigationDestination(dest)) return;

        // URL: DDX puts it on rawrequest.rawUrl, SJ v2 on parsed.url.
        const originalUrl =
          ctx.parsed?.url?.href ??
          ctx.rawrequest?.rawUrl ??
          '';

        const message =
          (err as { message?: string } | null)?.message ??
          String(err ?? 'Network request failed');
        const stack = (err as { stack?: string } | null)?.stack;

        // Tell the controller to suppress the console error since we're
        // handling it visually.
        if (props && 'suppressError' in props) {
          (props as Record<string, unknown>).suppressError = true;
        }

        this.render({
          originalUrl,
          status: 0,
          statusText: '',
          errorType: classifyTransportError(err),
          message,
          ...(stack ? { stack } : {}),
          requestId: newRequestId(),
          timestamp: Date.now(),
        });
      } catch (hookErr) {
        console.warn('[tabs/errorPlugin] error handler failed:', hookErr);
      }
    });
  }
}
