// src/core/helium/host/downloads/handlers.ts
//
// chrome.downloads.* host handlers (spec §26.1).
//
// `download()` is real: fetches the requested URL and triggers a
// browser-native download via an anchor click on a Blob URL. This
// works for any extension that needs to save data the user can
// access (filter lists, exports, generated artifacts).
//
// The rest of the surface is still stubbed:
//   - search           → []  (no download history maintained)
//   - setShelfEnabled  → no-op
//   - acceptDanger     → no-op
//   - pause/resume/cancel/remove/erase/open/show → throw 'not_supported'
//
// Events (onCreated, onChanged, onErased, onDeterminingFilename)
// never fire — there's no real download manager to observe.
//
// Limitations vs real Chrome:
//   - returned download id is an opaque counter, not usable with
//     other download methods (which all throw)
//   - `conflictAction` is ignored (Chrome's "uniquify" / "overwrite"
//     / "prompt" all just go through the browser's default behavior)
//   - `headers` and `method:'POST' + body` work but require the
//     extension to have host_permissions for the URL (the fetch
//     goes through Scramjet's proxy path)

import type { ExtensionContext } from '../../extfs/types';

function notSupported(method: string): never {
	throw new Error(`chrome.downloads.${method} is not supported`);
}

let nextDownloadId = 1;

interface DownloadOpts {
	url?: string;
	filename?: string;
	method?: 'GET' | 'POST';
	headers?: Array<{ name: string; value: string }>;
	body?: string;
	conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
	saveAs?: boolean;
}

export class DownloadsHandlers {
	download = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<number> => {
		const opts = (args[0] ?? {}) as DownloadOpts;
		if (typeof opts.url !== 'string' || opts.url.length === 0) {
			throw new Error('chrome.downloads.download requires a url');
		}
		// Build fetch init from the optional options. We honor method,
		// headers, body; everything else (conflictAction, saveAs) is
		// a no-op because we don't drive the browser's download UI.
		const init: RequestInit = { method: opts.method ?? 'GET' };
		if (Array.isArray(opts.headers) && opts.headers.length > 0) {
			init.headers = opts.headers.reduce<Record<string, string>>(
				(acc, h) => {
					if (typeof h?.name === 'string' && typeof h?.value === 'string') {
						acc[h.name] = h.value;
					}
					return acc;
				},
				{},
			);
		}
		if (typeof opts.body === 'string') init.body = opts.body;

		const id = nextDownloadId++;

		// Run the fetch asynchronously; the chrome.downloads.download
		// contract is to return the id immediately and let the caller
		// observe completion via chrome.downloads.onChanged (which we
		// don't fire — caveat noted in the file header).
		void (async () => {
			try {
				const res = await fetch(opts.url!, init);
				if (!res.ok) {
					console.warn(
						`[helium/downloads] fetch ${opts.url} failed:`,
						res.status,
						res.statusText,
					);
					return;
				}
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				try {
					const a = document.createElement('a');
					a.href = url;
					a.download = opts.filename ?? deriveFilenameFromUrl(opts.url!);
					a.style.display = 'none';
					document.body.appendChild(a);
					a.click();
					a.remove();
				} finally {
					// Defer revocation so the browser has time to start
					// the download. 30s is generous; real browsers
					// typically need <1s.
					setTimeout(() => URL.revokeObjectURL(url), 30_000);
				}
			} catch (err) {
				console.warn(
					'[helium/downloads] download failed:',
					opts.url,
					err,
				);
			}
		})();

		return id;
	};

	search = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<unknown[]> => [];

	pause = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('pause');

	resume = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('resume');

	cancel = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('cancel');

	remove = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('remove');

	erase = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('erase');

	open = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('open');

	show = async (_ctx: ExtensionContext, _args: unknown[]): Promise<never> =>
		notSupported('show');

	showDefaultFolder = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('showDefaultFolder');

	acceptDanger = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// No-op: Helium does not surface a danger prompt.
	};

	setShelfEnabled = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// No-op: Helium has no download shelf to toggle.
	};
}

/**
 * Pull a sensible filename out of the URL when the caller didn't
 * provide one. Strips query params, decodes percent-escapes, and
 * falls back to `download` if no segment is recoverable.
 */
function deriveFilenameFromUrl(url: string): string {
	try {
		const u = new URL(url);
		const segments = u.pathname.split('/').filter((s) => s.length > 0);
		const last = segments[segments.length - 1];
		if (last) return decodeURIComponent(last);
	} catch {
		/* ignore parse failures */
	}
	return 'download';
}
