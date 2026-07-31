/**
 * CachePluginManager — top-level cache management surface.
 *
 * Owns:
 *   - The CachePolicyRegistry (per-host wildcard policies).
 *   - The global enable flag (persisted in the registry).
 *
 * Exposes the host-side API surface used by `window.cachePlugins` and
 * by any future cache-management UI. The installer (`./installer.ts`)
 * wires this manager into the scramjet controller by attaching one
 * `HttpCachePlugin` per frame, passing through `manager.isEnabled` /
 * `manager.policyFor` as callbacks.
 *
 * Storage substrate
 * -----------------
 * Browser CacheStorage. There is no longer a pluggable backend — the
 * plugin owns all reads/writes via `caches.open(policy.cacheName)`.
 * Aggregate operations (bust/list/stats) are imported from the plugin
 * module rather than going through an abstraction.
 */

import {
	ORIGIN_CACHE_PREFIX,
	type CacheBackendStats,
	bustAll as cacheBustAll,
	bustForHost as cacheBustForHost,
	listKeys as cacheListKeys,
	statsFor as cacheStatsFor
} from './plugins/http-cache-plugin';
import {
	CachePolicyRegistry,
	type CachePolicy,
	type CachePolicyInput
} from './registry';

export interface ManagerStats {
	enabled: boolean;
	backend: string;
	totalEntries: number;
	totalBytes: number;
	byHost: CacheBackendStats['byHost'];
	policies: CachePolicy[];
}

export interface CacheEntryInfo {
	url: string;
	host: string;
	storedAt: number;
	bytes: number;
}

export interface PerOriginCacheStats {
	origin: string;
	entries: number;
	bytes: number;
	lastStoredAt: number;
}

export class CachePluginManager {
	private registry: CachePolicyRegistry;

	constructor(registry?: CachePolicyRegistry) {
		this.registry = registry ?? new CachePolicyRegistry();
	}

	/** Wait until persisted policy state has been loaded. */
	ready(): Promise<void> {
		return this.registry.ready();
	}

	getRegistry(): CachePolicyRegistry {
		return this.registry;
	}

	// ---------- global gate ----------

	isEnabled(): boolean {
		return this.registry.isEnabled();
	}

	async enable(): Promise<void> {
		await this.registry.setEnabled(true);
	}

	async disable(): Promise<void> {
		await this.registry.setEnabled(false);
	}

	// ---------- policy passthrough ----------

	async registerPolicy(input: CachePolicyInput): Promise<CachePolicy> {
		return this.registry.register(input);
	}

	async unregisterPolicy(id: string): Promise<boolean> {
		return this.registry.unregister(id);
	}

	listPolicies(): CachePolicy[] {
		return this.registry.list();
	}

	getPolicy(id: string): CachePolicy | null {
		return this.registry.get(id);
	}

	policyFor(url: string | URL): CachePolicy | null {
		return this.registry.policyFor(url);
	}

	// ---------- cache busting ----------

	/**
	 * Drop every entry whose stored host matches the given pattern.
	 * Pattern semantics: same as policy hostPatterns (`*.github.com`,
	 * `chase.com`, `*`).
	 *
	 * Busts across ALL cacheNames currently in use by registered
	 * policies — a single host might be cached into multiple buckets
	 * if policies overlap.
	 */
	async bustForHost(host: string): Promise<number> {
		const cacheNames = await this.collectCacheNames();
		let total = 0;
		for (const cn of cacheNames) {
			total += await cacheBustForHost(host, cn);
		}
		return total;
	}

	/** Drop everything under a specific policy's cacheName. */
	async bustForPolicy(id: string): Promise<number> {
		const p = this.registry.get(id);
		if (!p) return 0;
		const before = await cacheStatsFor(p.cacheName);
		await cacheBustAll(p.cacheName);
		return before.totalEntries;
	}

	/** Drop everything across every registered cacheName. */
	async bustAll(): Promise<void> {
		const cacheNames = await this.collectCacheNames();
		for (const cn of cacheNames) {
			await cacheBustAll(cn);
		}
	}

	// ---------- inspection ----------

	async stats(): Promise<ManagerStats> {
		const cacheNames = await this.collectCacheNames();
		const merged: CacheBackendStats = {
			totalEntries: 0,
			totalBytes: 0,
			byHost: {}
		};
		for (const cn of cacheNames) {
			const s = await cacheStatsFor(cn);
			merged.totalEntries += s.totalEntries;
			merged.totalBytes += s.totalBytes;
			for (const [host, info] of Object.entries(s.byHost)) {
				const slot = merged.byHost[host] ?? {
					entries: 0,
					bytes: 0,
					lastStoredAt: 0
				};
				slot.entries += info.entries;
				slot.bytes += info.bytes;
				if (info.lastStoredAt > slot.lastStoredAt) {
					slot.lastStoredAt = info.lastStoredAt;
				}
				merged.byHost[host] = slot;
			}
		}
		return {
			enabled: this.isEnabled(),
			backend: 'cache-storage',
			totalEntries: merged.totalEntries,
			totalBytes: merged.totalBytes,
			byHost: merged.byHost,
			policies: this.registry.list()
		};
	}

	async list(opts?: {
		host?: string;
		limit?: number;
	}): Promise<CacheEntryInfo[]> {
		const cacheNames = await this.collectCacheNames();
		const out: CacheEntryInfo[] = [];
		const limit = opts?.limit ?? Number.POSITIVE_INFINITY;
		for (const cn of cacheNames) {
			if (out.length >= limit) break;
			const remaining = limit - out.length;
			const keys = await cacheListKeys(cn, {
				host: opts?.host,
				limit: remaining
			});
			for (const k of keys) {
				out.push(k as CacheEntryInfo);
				if (out.length >= limit) break;
			}
		}
		return out;
	}

	/**
	 * Per-origin breakdown of cached entries.
	 *
	 * Origins are recovered from each entry's stored upstream URL rather
	 * than from the bucket name, since bucket names are one-way hashes.
	 */
	async statsByOrigin(): Promise<PerOriginCacheStats[]> {
		const entries = await this.list();
		const byOrigin = new Map<string, PerOriginCacheStats>();
		for (const entry of entries) {
			let origin: string;
			try {
				origin = new URL(entry.url).origin.toLowerCase();
			} catch {
				origin = entry.host || 'unknown';
			}
			const slot = byOrigin.get(origin) ?? {
				origin,
				entries: 0,
				bytes: 0,
				lastStoredAt: 0
			};
			slot.entries += 1;
			slot.bytes += entry.bytes;
			if (entry.storedAt > slot.lastStoredAt) {
				slot.lastStoredAt = entry.storedAt;
			}
			byOrigin.set(origin, slot);
		}
		return [...byOrigin.values()].sort((a, b) => b.bytes - a.bytes);
	}

	// ---------- internals ----------

	/**
	 * Enumerate every bucket this manager owns.
	 *
	 * Buckets are origin-scoped now, so their names are content-derived
	 * (`ddx-cache-v2:<sha56(origin)>`) and cannot be reconstructed from
	 * the policy list. We therefore ask CacheStorage directly. Policy
	 * `cacheName`s are still unioned in so that any pre-v2 buckets left
	 * over from the policy-scoped era remain bustable.
	 */
	private async collectCacheNames(): Promise<string[]> {
		const set = new Set<string>();
		try {
			for (const name of await caches.keys()) {
				if (name.startsWith(ORIGIN_CACHE_PREFIX)) set.add(name);
			}
		} catch (err) {
			console.warn('[cachePluginManager] caches.keys() failed:', err);
		}
		for (const p of this.registry.list()) {
			if (p.cacheName) set.add(p.cacheName);
		}
		return [...set];
	}
}

export type { CachePolicy, CachePolicyInput } from './registry';
export type {
	CacheBackendStats,
	CacheKey
} from './plugins/http-cache-plugin';
