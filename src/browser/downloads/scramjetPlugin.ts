// src/browser/downloads/scramjetPlugin.ts
//
// Scramjet plugin that intercepts navigation responses which are
// real downloads (Content-Disposition: attachment OR navigation to
// a MIME type the browser cannot display inline) and routes them
// through DownloadsManager.
//
// Reference implementation: `concepting/browser.js/packages/chrome/
// src/proxy/scramjet.ts` `isDownload()` + `handlefetch()` lines
// 490-625. This file mirrors that logic precisely, adapted to the
// plugin/`preresponse` hook model.
//
// CRITICAL CORRECTNESS RULES (don't loosen these — they're what
// kept the prior version from breaking YouTube, X, etc.):
//
//   1. Destination MUST be exactly `'document'` or `'iframe'`. Any
//      other value (`''`, `'video'`, `'audio'`, `'image'`, `'fetch'`,
//      `'xmlhttprequest'`, `'script'`, etc.) means a SUBRESOURCE
//      fetch initiated by the page itself — the page wants that
//      data; never intercept. (YouTube fetches video chunks with
//      `destination: 'video'` and AAC audio with `destination:
//      'audio'`; both have `application/octet-stream` MIME on some
//      ranges. Without strict destination check, the heuristic
//      triggers on every byte of a stream.)
//
//   2. `Content-Disposition: inline` FORCES inline display even if
//      the MIME type looks "downloadable". Some sites set
//      `inline` on PDFs / SVGs to show them in-frame; respect it.
//
//   3. Use scramjet's `isInlineDisplayableMimeType` (exposed via
//      `globalThis.$scramjet`). Don't roll your own prefix list —
//      the canonical one in scramjet/packages/core/src/shared/mime.ts
//      already handles edge cases like `application/x-mpegURL`,
//      `image/svg+xml`, etc.
//
//   4. NEVER re-fetch. The original response body stream is right
//      there in `props.response.body` — pipe it through to the
//      DownloadsManager so progress reports are real bytes from the
//      single network request the user/page initiated.
//
//   5. Return an unresolved Promise from the tap (or replace the
//      response with one that hangs forever) so the iframe's
//      navigation never settles. This matches Chrome's behavior:
//      clicking a `.zip` link doesn't navigate the tab — the URL
//      bar stays on the previous page, the download starts, and
//      the navigation is silently abandoned. Mirrors browser.js
//      line 621: `await new Promise(() => {});`.
//
//   6. Status check. 200/206 only. Redirects (3xx) have no body
//      to download. 4xx/5xx are error pages we want to show, not
//      eat as bytes.
//
// FEATURE FLAG (debug):
//   `window.__ddxInterceptDownloads = false` disables the plugin
//   without uninstalling. For when you need to confirm a problem
//   isn't this code.

interface PreresponseContext {
  request: {
    rawDestination?: string;
    destination?: string;
  };
  parsed: {
    url: URL;
  };
}

interface BareResponseLike {
  headers: Headers;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}

interface PreresponseProps {
  response: BareResponseLike;
}

interface ScramjetFrameLike {
  hooks: {
    fetch: {
      preresponse: unknown;
    };
  };
}

interface ScramjetGlobal {
  Plugin?: new (name: string) => unknown;
  isInlineDisplayableMimeType?: (mime: string) => boolean;
}

/**
 * Strict navigation check. Returns true only for destinations Chrome
 * itself treats as document-level. Critically EXCLUDES empty string
 * — empty destination on Scramjet usually means "subresource XHR /
 * fetch", which page JS is consuming directly.
 */
function isNavigationDestination(dest: string | undefined): boolean {
  return dest === 'document' || dest === 'iframe';
}

/**
 * Mirror of `concepting/browser.js/packages/chrome/src/proxy/
 * scramjet.ts` lines 490-511. Returns true iff this response should
 * be downloaded instead of displayed.
 *
 * Logic:
 *   - Non-navigation destination → never download
 *   - `Content-Disposition: inline` → never download (site explicitly
 *     opts into inline display)
 *   - Other `Content-Disposition` (e.g. `attachment`) → download
 *   - No `Content-Disposition` + non-inline MIME → download
 *   - No `Content-Disposition` + inline MIME → display
 */
function shouldDownload(
  headers: Headers,
  destination: string | undefined,
  isInlineDisplayable: (m: string) => boolean,
): boolean {
  if (!isNavigationDestination(destination)) return false;

  const cd = headers.get('content-disposition');
  if (cd) {
    // Per RFC 6266 §4, `Content-Disposition` value is a single token
    // possibly followed by parameters. We compare against `inline`
    // case-insensitively; the comparison `header === 'inline'` in
    // browser.js (line 497) is overly strict but a fine baseline.
    const trimmed = cd.trim().toLowerCase();
    if (trimmed === 'inline' || trimmed.startsWith('inline;')) return false;
    return true;
  }

  const ct = headers.get('content-type');
  if (ct && isInlineDisplayable(ct)) return false;
  // No CD, MIME is not inline-displayable (or absent) → treat as download.
  // Note: a response with NO content-type AND no content-disposition is
  // rare for top-level navigation; we don't try to be smarter than the
  // server here.
  return !!ct; // only treat as download if there's at least a MIME hint
}

/**
 * Parse `Content-Disposition: attachment; filename="foo.zip"` /
 * `filename*=UTF-8''foo.zip` to extract the suggested filename.
 */
function parseFilenameFromContentDisposition(cd: string): string | undefined {
  if (!cd) return undefined;
  const star = cd.match(/filename\*\s*=\s*[^']+'[^']*'([^;]+)/i);
  if (star && star[1]) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ }
  }
  const plain = cd.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
  if (plain && plain[1]) return plain[1].trim();
  return undefined;
}

/**
 * The DDX download-interception plugin. Single instance can be
 * installed on multiple Scramjet Frames.
 */
export class DdxDownloadInterceptPlugin {
  public readonly name = 'ddx-download-intercept';
  public readonly dependencies: string[] = [];
  private inner: { tap: (hook: unknown, fn: (...args: unknown[]) => unknown) => void } | null = null;

  install(frame: ScramjetFrameLike): void {
    const sj = (globalThis as { $scramjet?: ScramjetGlobal }).$scramjet;
    if (!sj?.Plugin) {
      console.warn('[downloads/scramjet] $scramjet.Plugin unavailable — interception disabled');
      return;
    }
    const isInlineDisplayable = sj.isInlineDisplayableMimeType
      ?? ((m: string) => {
        // Defensive fallback if the scramjet build doesn't expose
        // the helper. Mirror the most-permissive logic — only
        // reject things that look obviously like binaries.
        const t = m.toLowerCase().split(';')[0]!.trim();
        if (t.startsWith('text/') || t.startsWith('image/')
          || t.startsWith('audio/') || t.startsWith('video/')) return true;
        if (t === 'application/pdf' || t === 'application/json'
          || t === 'application/javascript' || t === 'application/xml'
          || t === 'application/xhtml+xml') return true;
        return false;
      });

    if (!this.inner) {
      // The constructed Plugin doesn't expose its tap interface in
      // the typed surface; coerce via unknown to the structural
      // shape we care about.
      this.inner = new sj.Plugin('ddx-download-intercept') as unknown as {
        tap: (hook: unknown, fn: (...args: unknown[]) => unknown) => void;
      };
    }
    if (!this.inner) return;

    const preresponse = frame.hooks.fetch.preresponse;
    // Capture the helper outside the tap closure so each invocation
    // doesn't redo the destructure.
    const isInline = isInlineDisplayable;

    this.inner.tap(preresponse, async (ctxArg: unknown, propsArg: unknown) => {
      try {
        const ctx = ctxArg as PreresponseContext;
        const props = propsArg as PreresponseProps;

        // Feature-flag escape hatch.
        if ((window as { __ddxInterceptDownloads?: boolean }).__ddxInterceptDownloads === false) {
          return;
        }

        const response = props?.response;
        if (!response?.headers) return;

        // Status: only intercept successful navigations. 3xx have no
        // body; 4xx/5xx should display the error page.
        const status = response.status;
        if (status !== 200 && status !== 206) return;

        const dest = ctx.request.rawDestination ?? ctx.request.destination;
        if (!shouldDownload(response.headers, dest, isInline)) return;

        const url = ctx.parsed?.url?.href;
        if (!url) return;

        // Got a real download. Take ownership of the body stream
        // (the iframe will never see it because we hang the
        // response forever below).
        const cd = response.headers.get('content-disposition') ?? '';
        const ct = response.headers.get('content-type') ?? 'application/octet-stream';
        const cl = response.headers.get('content-length');
        const totalBytes = cl ? parseInt(cl, 10) || -1 : -1;
        const filename = parseFilenameFromContentDisposition(cd);

        // Hand off the body stream to the manager. The manager's
        // default provider doesn't support stream ingest yet — it
        // does its own fetch. So we register a one-shot
        // stream-provider just for this download and route through
        // that. If the page-driven provider isn't available we fall
        // back to the manager's default behavior (re-fetch).
        await routeStreamToManager(url, response, {
          filename,
          mimeType: ct,
          totalBytes,
        }).catch((err) => {
          console.warn('[downloads/scramjet] stream routing failed:', err);
        });

        // Hang forever so the iframe's navigation never completes.
        // The user stays on the prior page; the download fills the
        // shelf. Matches browser.js line 621.
        await new Promise(() => {});
      } catch (err) {
        console.warn('[downloads/scramjet] preresponse handler failed:', err);
      }
    });
  }
}

/**
 * Pipe the response body into a DownloadsManager-managed download.
 * We register a per-download "stream" provider so the manager owns
 * lifecycle (cancel/pause/resume hooks) while we own the source
 * stream. The provider is removed after the download settles.
 */
async function routeStreamToManager(
  url: string,
  response: BareResponseLike,
  meta: { filename?: string | undefined; mimeType: string; totalBytes: number },
): Promise<void> {
  const { DownloadsManager } = await import('@apis/downloads');
  const mgr = DownloadsManager.getInstance();
  if (!response.body) {
    // No body to consume — fall back to the default provider's
    // re-fetch logic so the download is at least attempted.
    await mgr.startDownload({
      url,
      ...(meta.filename ? { filename: meta.filename } : {}),
    });
    return;
  }

  // Register a one-shot provider keyed by URL + random id so the
  // manager can route this specific download through it without
  // touching the default provider.
  const providerName = `__stream_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let ac: AbortController | null = new AbortController();
  let paused = false;
  let resumeResolver: (() => void) | null = null;
  const unregister = mgr.registerProvider({
    name: providerName,
    async start(_opts, controller): Promise<{ pause: () => void; resume: () => void; cancel: () => void }> {
      const ctrlPause = (): void => { paused = true; };
      const ctrlResume = (): void => {
        paused = false;
        resumeResolver?.();
        resumeResolver = null;
      };
      const ctrlCancel = (): void => {
        try { ac?.abort(); } catch { /* swallow */ }
      };

      // Spawn the consume loop async; do NOT await it inside `start`
      // because the manager needs `start` to return so per-item
      // control bindings register. The loop reports progress +
      // completion via the controller.
      void (async () => {
        const reader = response.body!.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        try {
          while (true) {
            if (ac?.signal.aborted) {
              controller.reportError('USER_CANCELED');
              return;
            }
            if (paused) {
              await new Promise<void>((res) => { resumeResolver = res; });
              continue;
            }
            const result = await reader.read();
            if (result.done) break;
            const chunk = result.value as Uint8Array;
            chunks.push(chunk);
            received += chunk.byteLength;
            controller.reportProgress(received, meta.totalBytes);
          }
          // Stream drained — assemble Blob and trigger browser download.
          const blob = new Blob(chunks as BlobPart[], { type: meta.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = controller.item.filename;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } finally {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
          }
          controller.reportComplete();
        } catch (err) {
          if ((err as { name?: string } | null)?.name === 'AbortError') {
            controller.reportError('USER_CANCELED');
          } else {
            console.warn('[downloads/scramjet] stream consume error:', err);
            controller.reportError('NETWORK_FAILED');
          }
        } finally {
          // Clean up the one-shot provider so registry stays small.
          try { unregister(); } catch { /* swallow */ }
          ac = null;
        }
      })();

      return { pause: ctrlPause, resume: ctrlResume, cancel: ctrlCancel };
    },
  });

  await mgr.startDownload({
    url,
    ...(meta.filename ? { filename: meta.filename } : {}),
    provider: providerName,
  });
}
