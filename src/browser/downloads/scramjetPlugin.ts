
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
    const trimmed = cd.trim().toLowerCase();
    if (trimmed === 'inline' || trimmed.startsWith('inline;')) return false;
    return true;
  }

  const ct = headers.get('content-type');
  if (ct && isInlineDisplayable(ct)) return false;
  return !!ct;
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
        const t = m.toLowerCase().split(';')[0]!.trim();
        if (t.startsWith('text/') || t.startsWith('image/')
          || t.startsWith('audio/') || t.startsWith('video/')) return true;
        if (t === 'application/pdf' || t === 'application/json'
          || t === 'application/javascript' || t === 'application/xml'
          || t === 'application/xhtml+xml') return true;
        return false;
      });

    if (!this.inner) {
      this.inner = new sj.Plugin('ddx-download-intercept') as unknown as {
        tap: (hook: unknown, fn: (...args: unknown[]) => unknown) => void;
      };
    }
    if (!this.inner) return;

    const preresponse = frame.hooks.fetch.preresponse;
    const isInline = isInlineDisplayable;

    this.inner.tap(preresponse, async (ctxArg: unknown, propsArg: unknown) => {
      try {
        const ctx = ctxArg as PreresponseContext;
        const props = propsArg as PreresponseProps;

        if ((window as { __ddxInterceptDownloads?: boolean }).__ddxInterceptDownloads === false) {
          return;
        }

        const response = props?.response;
        if (!response?.headers) return;

        const status = response.status;
        if (status !== 200 && status !== 206) return;

        const dest = ctx.request.rawDestination ?? ctx.request.destination;
        if (!shouldDownload(response.headers, dest, isInline)) return;

        const url = ctx.parsed?.url?.href;
        if (!url) return;

        const cd = response.headers.get('content-disposition') ?? '';
        const ct = response.headers.get('content-type') ?? 'application/octet-stream';
        const cl = response.headers.get('content-length');
        const totalBytes = cl ? parseInt(cl, 10) || -1 : -1;
        const filename = parseFilenameFromContentDisposition(cd);

        await routeStreamToManager(url, response, {
          filename,
          mimeType: ct,
          totalBytes,
        }).catch((err) => {
          console.warn('[downloads/scramjet] stream routing failed:', err);
        });

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
    await mgr.startDownload({
      url,
      ...(meta.filename ? { filename: meta.filename } : {}),
    });
    return;
  }

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
