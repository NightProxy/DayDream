import { createProfileStorage, type StorageRoot } from "@apis/data/profileStorage";

/**
 * Per-profile, per-origin cache scope resolver.
 *
 * The Scramjet cache-plugin's default `cacheName` is a bucket-agnostic
 * string (see `src/apis/cachePlugins/registry.ts`). To land §6 of the
 * proposal without rewriting the whole plugin, we expose a helper that
 * yields:
 *
 *   - `originRoot.caches` when the active backend supports it (Chromium
 *     buckets) — a real isolated CacheStorage per-profile-per-origin.
 *   - `null` otherwise (Firefox, Safari, IDB shim) — the cache-plugin
 *     falls back to host `caches.open(prefixedCacheName)` where
 *     `prefixedCacheName` combines the base policy name with a
 *     profile+origin hash.
 *
 * `getProfileScopedCacheName(policyCacheName, profileId, targetOrigin)`
 * returns the prefixed name used in the fallback path.
 */
export async function getProfileScopedRoot(
	profileId: string,
	targetOrigin: string,
): Promise<StorageRoot> {
	const storage = await createProfileStorage();
	return storage.getOriginRoot(profileId, targetOrigin);
}

export async function getProfileScopedCaches(
	profileId: string,
	targetOrigin: string,
): Promise<CacheStorage | null> {
	const root = await getProfileScopedRoot(profileId, targetOrigin);
	return root.caches ?? null;
}

export function getProfileScopedCacheName(
	baseCacheName: string,
	profileId: string,
	targetOrigin: string,
): string {
	const suffix = hashSuffix(`${profileId}\0${targetOrigin}`);
	return `${baseCacheName}::${suffix}`;
}

function hashSuffix(input: string): string {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		hash = (hash * 33) ^ input.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
}
