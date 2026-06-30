
import type { ExtensionContext } from '../../extfs/types';

function notSupported(method: string): never {
	throw new Error(
		`chrome.downloads.${method} is not supported by the current provider`,
	);
}

export class DownloadsHandlers {
	private async mgr(): Promise<import('@apis/downloads').DownloadsManager> {
		const { DownloadsManager } = await import('@apis/downloads');
		return DownloadsManager.getInstance();
	}

	download = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<number> => {
		const opts = (args[0] ?? {}) as {
			url?: string;
			filename?: string;
			method?: 'GET' | 'POST';
			headers?: Array<{ name: string; value: string }>;
			body?: string;
			conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
			saveAs?: boolean;
		};
		if (typeof opts.url !== 'string' || opts.url.length === 0) {
			throw new Error('chrome.downloads.download requires a url');
		}
		const mgr = await this.mgr();
		return mgr.startDownload({
			url: opts.url,
			...(opts.filename ? { filename: opts.filename } : {}),
			...(opts.method ? { method: opts.method } : {}),
			...(opts.headers ? { headers: opts.headers } : {}),
			...(typeof opts.body === 'string' ? { body: opts.body } : {}),
			...(opts.conflictAction ? { conflictAction: opts.conflictAction } : {}),
			...(typeof opts.saveAs === 'boolean' ? { saveAs: opts.saveAs } : {}),
		});
	};

	search = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<unknown[]> => {
		const query = (args[0] ?? {}) as Parameters<
			import('@apis/downloads').DownloadsManager['search']
		>[0];
		const mgr = await this.mgr();
		return mgr.search(query);
	};

	pause = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
		const id = args[0];
		if (typeof id !== 'number') throw new Error('chrome.downloads.pause requires id');
		const mgr = await this.mgr();
		await mgr.pause(id);
	};

	resume = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
		const id = args[0];
		if (typeof id !== 'number') throw new Error('chrome.downloads.resume requires id');
		const mgr = await this.mgr();
		await mgr.resume(id);
	};

	cancel = async (_ctx: ExtensionContext, args: unknown[]): Promise<void> => {
		const id = args[0];
		if (typeof id !== 'number') throw new Error('chrome.downloads.cancel requires id');
		const mgr = await this.mgr();
		await mgr.cancel(id);
	};

	remove = async (_ctx: ExtensionContext, args: unknown[]): Promise<number[]> => {
		const query = (args[0] ?? {}) as Parameters<
			import('@apis/downloads').DownloadsManager['erase']
		>[0];
		const mgr = await this.mgr();
		return mgr.erase(query);
	};

	erase = async (_ctx: ExtensionContext, args: unknown[]): Promise<number[]> => {
		const query = (args[0] ?? {}) as Parameters<
			import('@apis/downloads').DownloadsManager['erase']
		>[0];
		const mgr = await this.mgr();
		return mgr.erase(query);
	};

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
		// No-op: DDX has no danger prompt UI.
	};

	setShelfEnabled = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// No-op: DDX has no download shelf to toggle.
	};
}
