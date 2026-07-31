/**
 * Cache plugin system — public entry point.
 *
 * Specs:
 *   - 2026-06-06-opfs-cache-plugin-system-design.md (original, partially superseded)
 *   - 2026-06-30-cache-plugin-cachestorage-unify-design.md (current)
 *
 * Public surface (also available on `window.cachePlugins` once
 * `installCachePluginManager(controller, manager)` runs):
 *   - CachePluginManager           — top-level manager class
 *   - CachePolicyRegistry          — the per-host policy registry
 *   - HttpCachePlugin              — the per-frame Scramjet plugin
 *                                    (backed directly by CacheStorage)
 *   - installCachePluginManager    — hook installer (wraps createFrame)
 *
 * The legacy `CacheAPI` (session/tab restoration) is unrelated and lives
 * in `src/apis/cache.ts`. Don't conflate.
 */

export { CachePluginManager } from './manager';
export type { ManagerStats, CacheEntryInfo } from './manager';
export {
	CachePolicyRegistry,
	type CachePolicy,
	type CachePolicyInput
} from './registry';
export { createHttpCachePlugin } from './plugins/http-cache-plugin';
export type {
	HttpCachePluginOptions,
	CacheKey,
	CacheBackendStats,
	CacheMeta
} from './plugins/http-cache-plugin';
export { installCachePluginManager } from './installer';
export {
	hostMatchesPattern,
	normalizeHost,
	policySpecificity,
	compileHostPattern
} from './host-match';
