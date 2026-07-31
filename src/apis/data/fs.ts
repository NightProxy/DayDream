import { TFS } from "@terbiumos/tfs/browser";

/**
 * NightFS — thin TFS wrapper.
 *
 * By default, mounts on the OPFS root (`navigator.storage.getDirectory()`).
 * Pass a pre-resolved `FileSystemDirectoryHandle` to scope this NightFS
 * instance to a subdirectory instead. Scoped instances get their own
 * `.TFS_STORE` sidecar inside their own subtree, so different callers no
 * longer race on a single root-level `.TFS_STORE`.
 *
 * See `scopedNightFs.ts` for the singleton accessor per scope.
 */
class NightFS implements INightFS {
	private tfshandle!: FileSystemDirectoryHandle;
	core!: TFS;
	init: Promise<void>;

	constructor(rootHandle?: FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>) {
		this.init = (async () => {
			this.tfshandle = rootHandle
				? await rootHandle
				: await navigator.storage.getDirectory();
			this.core = new TFS(this.tfshandle);
		})();
	}
}

export { NightFS };
