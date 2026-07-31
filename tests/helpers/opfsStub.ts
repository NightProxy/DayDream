/**
 * Minimal `navigator.storage.getDirectory` stub for tests that
 * transitively pull in modules whose top-level instantiates
 * `new NightFS()` (which calls `navigator.storage.getDirectory()`).
 *
 * jsdom doesn't implement OPFS, so the real call rejects with
 * "Cannot read properties of undefined (reading 'getDirectory')",
 * surfacing as an unhandled rejection in the test runner.
 *
 * The stub returns an object that loosely satisfies
 * `FileSystemDirectoryHandle`. We never actually persist anything in
 * these tests — modules that touch OPFS during their import side-effects
 * just need the `getDirectory()` call not to reject.
 *
 * Import this once near the top of any jsdom test file that loads
 * modules from `@apis/nightplus`, `@apis/settings`, etc., directly or
 * transitively.
 */

if (
	typeof navigator !== 'undefined' &&
	!(navigator as { storage?: { getDirectory?: unknown } }).storage
) {
	Object.defineProperty(navigator, 'storage', {
		value: {
			getDirectory: async () => fakeDirHandle()
		},
		configurable: true
	});
}

function fakeDirHandle(): unknown {
	// Return a minimal FileSystemDirectoryHandle-shaped fake. TFS calls
	// `getDirectoryHandle()` lazily during its own init; we return more
	// fakes so the chain doesn't reject. Tests that actually exercise
	// persistence shouldn't use this stub — they should mock SettingsAPI
	// directly (see `tests/cachePlugins-registry.test.ts`).
	const handle: Record<string, unknown> = {
		name: '',
		kind: 'directory',
		async getDirectoryHandle(): Promise<unknown> {
			return fakeDirHandle();
		},
		async getFileHandle(): Promise<unknown> {
			return {
				name: '',
				kind: 'file',
				async getFile(): Promise<Blob> {
					return new Blob([]);
				},
				async createWritable(): Promise<{
					write(_: unknown): Promise<void>;
					close(): Promise<void>;
				}> {
					return {
						async write() {},
						async close() {}
					};
				}
			};
		},
		async removeEntry(): Promise<void> {},
		async *entries(): AsyncIterableIterator<[string, unknown]> {
			/* empty */
		},
		async *values(): AsyncIterableIterator<unknown> {
			/* empty */
		},
		async *keys(): AsyncIterableIterator<string> {
			/* empty */
		}
	};
	return handle;
}

export {}; // make this a module
