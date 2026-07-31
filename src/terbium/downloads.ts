/**
 * Terbium download provider for Daydream's DownloadsManager.
 *
 * Replaces Daydream's `DefaultWebDownloadProvider` when running inside
 * Terbium. Routes every download through `tb.dialog.SaveFile` so the user
 * picks a destination in Terbium's VFS, then writes the bytes via
 * `tb.fs.promises.writeFile`.
 *
 * Falls back gracefully on cancellation, network failure, or write
 * failure — each surfaced through `controller.reportError(reason)` with
 * a Chrome-compatible `DownloadInterruptReason` string so the rest of
 * Daydream's download UI stays unchanged.
 *
 * Note: This provider buffers the entire response body in memory before
 * writing to Terbium VFS. Suitable for files up to a few hundred MB.
 * For larger downloads, a streaming sink in tb.fs would be required —
 * not yet exposed by the Terbium API.
 */

import type {
  DownloadOptions,
  DownloadProvider,
  DownloadController,
} from '@apis/downloads';

const TAG = '[terbium/downloads]';

/**
 * Pull the last decoded path segment off a URL. Mirrors the public
 * `inferFilenameFromUrl` helper in `@apis/downloads` but kept local so
 * this module has no implementation-level coupling to the rest of the
 * downloads infrastructure.
 */
function inferFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // malformed URL — fall through
  }
  return 'download';
}

export class TerbiumDownloadProvider implements DownloadProvider {
  readonly name = 'terbium';
  private tb: any;

  constructor(tb: any) {
    this.tb = tb;
  }

  async start(
    options: DownloadOptions,
    controller: DownloadController,
  ): Promise<void> {
    if (!this.tb?.dialog?.SaveFile || !this.tb?.fs?.promises?.writeFile) {
      console.warn(
        TAG,
        'tb.dialog.SaveFile or tb.fs.promises.writeFile missing at download time',
      );
      controller.reportError('FILE_FAILED');
      return;
    }

    // 1. Resolve the suggested directory: /home/<username>/Downloads/
    let username = 'user';
    try {
      username = (await this.tb.user?.username?.()) || 'user';
    } catch {
      // ignore — fall back to "user"
    }
    const defaultDir = `/home/${username}/Downloads/`;

    // 2. Best-effort: ensure the directory exists. Ignore errors — the
    //    SaveFile dialog still lets the user navigate elsewhere, and the
    //    directory may already exist (Terbium's mkdir is not guaranteed
    //    to be idempotent across versions).
    try {
      await this.tb.fs?.promises?.mkdir?.(defaultDir);
    } catch {
      // already exists / no perms / not supported — caller's choice
    }

    const filename = options.filename || inferFilenameFromUrl(options.url);

    // 3. Prompt the user for a save location via Terbium's SaveFile dialog.
    const savePath = await new Promise<string | null>((resolve) => {
      try {
        this.tb.dialog.SaveFile({
          title: `Save ${filename}`,
          // NOTE: `defualtDir` is Terbium's documented spelling (sic).
          // Do not "fix" — the dialog ignores `defaultDir`.
          defualtDir: defaultDir,
          filename,
          onOk: (path: string) => resolve(path),
          onCancel: () => resolve(null),
        });
      } catch (err) {
        console.warn(TAG, 'SaveFile threw:', err);
        resolve(null);
      }
    });

    if (!savePath) {
      controller.reportError('USER_CANCELED');
      return;
    }

    // 4. Fetch the bytes. We buffer the full response into memory before
    //    handing it to Terbium's writeFile; `tb.fs.promises.writeFile`
    //    does not currently expose a streaming sink.
    let bytes: Uint8Array;
    try {
      const headers: Record<string, string> = {};
      for (const h of options.headers ?? []) headers[h.name] = h.value;
      const init: RequestInit = {
        method: options.method ?? 'GET',
        ...(options.body ? { body: options.body } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
      };
      const resp = await fetch(options.url, init);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const buf = await resp.arrayBuffer();
      bytes = new Uint8Array(buf);
    } catch (err) {
      console.warn(TAG, 'fetch failed:', err);
      controller.reportError('NETWORK_FAILED');
      return;
    }

    // 5. Write to the chosen path through tb.fs.
    try {
      await this.tb.fs.promises.writeFile(savePath, bytes);
    } catch (err) {
      console.warn(TAG, 'writeFile failed:', err);
      controller.reportError('FILE_FAILED');
      try {
        this.tb.notification?.Toast?.({
          message: `Save failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          application: 'Daydream',
          iconSrc: './icon.png',
        });
      } catch {
        // toast is best-effort
      }
      return;
    }

    // 6. Report success. Surface the chosen path as the final filename
    //    so the downloads UI shows where the file actually landed.
    controller.reportProgress(bytes.byteLength, bytes.byteLength);
    controller.reportComplete(undefined, savePath);

    try {
      this.tb.notification?.Toast?.({
        message: `Downloaded ${filename}`,
        application: 'Daydream',
        iconSrc: './icon.png',
        time: 4000,
      });
    } catch {
      // toast is best-effort
    }
  }

  // The SaveFile dialog blocks the user synchronously from their POV —
  // by the time `start()` returns, the file has either been written or
  // the user has cancelled. There is no in-flight cancel/pause surface.
  cancel(_id: number): void { /* not supported */ }
  pause(_id: number): void { /* not supported */ }
  resume(_id: number): void { /* not supported */ }
}

/**
 * Register the Terbium download provider as the default provider on
 * Daydream's DownloadsManager. Called by boot.ts after `parent.tb` is
 * detected. Feature-gated on the two `tb` surfaces we strictly need
 * (`dialog.SaveFile` + `fs.promises.writeFile`) so older Terbium
 * versions, or future ones that drop these APIs, degrade gracefully
 * back to the built-in `DefaultWebDownloadProvider`.
 */
export async function installDownloads(tb: any): Promise<void> {
  if (!tb?.dialog?.SaveFile || !tb?.fs?.promises?.writeFile) {
    console.warn(
      TAG,
      'tb.dialog.SaveFile or tb.fs.promises.writeFile missing — skipping install',
    );
    return;
  }
  try {
    const { DownloadsManager } = await import('@apis/downloads');
    const mgr = DownloadsManager.getInstance();
    const provider = new TerbiumDownloadProvider(tb);
    mgr.registerProvider(provider);
    // `registerProvider` sets the first registered provider as default,
    // but in a real Daydream boot the web provider has already been
    // registered by the time we get here. Force-swap the default so
    // unspecified `options.provider` routes downloads through Terbium.
    mgr.setDefaultProvider(provider.name);
    console.log(TAG, 'TerbiumDownloadProvider registered as default');
  } catch (err) {
    console.warn(TAG, 'install failed:', err);
  }
}
