import { NightFS } from './fs';

/**
 * Scoped NightFS accessor.
 *
 * Each scope name maps to a distinct subdirectory under the OPFS root, so
 * the NightFS mounted there has its own `.TFS_STORE` sidecar and cannot
 * race on file-handle acquisition with NightFS instances scoped to other
 * subdirectories.
 *
 * Layout:
 *   /                             OPFS root — NightFS is no longer mounted here
 *   /profiles/<hash>/             profile buckets (via profileStorage.ts)
 *   /app/logs/                    Logger scope
 *   /app/sw-settings/             ServiceWorkerSettings scope
 *   /app/sw-cache/                Service-worker HTTP cache scope
 *   /app/extensions/              helium extfs scope
 *
 * All four scopes share the OPFS root but never share a `.TFS_STORE`.
 * Concurrent writes across scopes cannot collide.
 */

const instances = new Map<string, NightFS>();

async function resolveScopeHandle(
	segments: string[]
): Promise<FileSystemDirectoryHandle> {
	let handle = await navigator.storage.getDirectory();
	for (const segment of segments) {
		handle = await handle.getDirectoryHandle(segment, { create: true });
	}
	return handle;
}

function normalizeScope(scope: string): string[] {
	return scope.split('/').filter(Boolean);
}

/**
 * Return a memoized NightFS scoped to the given subdirectory path (relative
 * to the OPFS root). The returned instance's `.init` resolves once the
 * scope directory exists and TFS has been constructed against it.
 *
 * Callers must `await instance.init` before touching `instance.core.fs`.
 */
export function getScopedNightFs(scope: string): NightFS {
	const existing = instances.get(scope);
	if (existing) return existing;
	const segments = normalizeScope(scope);
	if (segments.length === 0) {
		throw new Error(
			"getScopedNightFs: scope must be a non-empty subdirectory path"
		);
	}
	const handle = resolveScopeHandle(segments);
	const nfs = new NightFS(handle);
	instances.set(scope, nfs);
	return nfs;
}

/** Test-only helper to reset the memoized scope map. */
export function __resetScopedNightFsForTests(): void {
	instances.clear();
}
