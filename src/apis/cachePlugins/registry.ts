/**
 * CachePolicyRegistry — per-host cache policies.
 *
 * A policy answers "should this URL be cached, and into which cache
 * bucket?" based on the URL's hostname matched against a set of
 * wildcard patterns (`*.github.com`, `docs.*`, `*`). Policies are
 * persisted to OPFS via SettingsAPI under `/data/cachePolicy.json`.
 *
 * Specificity wins: when multiple policies match a host, the policy
 * with the highest specificity score is chosen. Ties are broken by
 * insertion order (earliest-registered wins).
 *
 * A policy with `enabled: false` still "wins" — the registry returns
 * it, and the manager treats a winning-but-disabled policy as a
 * negative rule (don't cache). This is how you write "cache everything
 * except *.bank.com" — register the catch-all `*` first, then a more
 * specific disabled policy for `*.bank.com`.
 */

import { SettingsAPI } from '@apis/settings';
import {
	compileHostPattern,
	normalizeHost,
	policySpecificity
} from './host-match';

const STORE_KEY = 'cachePolicies';
const ENABLED_KEY = 'cacheEnabled';

const DEFAULT_POLICY_ID = 'default';
const DEFAULT_CACHE_NAME = 'default-v1';

export interface CachePolicy {
	id: string;
	hostPatterns: string[];
	cacheName: string;
	enabled: boolean;
	createdAt: number;
}

export interface CachePolicyInput {
	id: string;
	hostPatterns: string[];
	cacheName?: string;
	enabled?: boolean;
}

interface CompiledPolicy {
	policy: CachePolicy;
	matchers: Array<{ pattern: string; test: (host: string) => boolean; specificity: number }>;
	maxSpecificity: number;
}

export class CachePolicyRegistry {
	private settings: SettingsAPI;
	private compiled: CompiledPolicy[] = [];
	private order: string[] = [];
	private globalEnabled = true;
	private loaded: Promise<void>;

	constructor(settings?: SettingsAPI) {
		this.settings =
			settings ?? new SettingsAPI('/data/cachePolicy.json', '/data');
		this.loaded = this.load();
	}

	/** Wait until persisted state has been loaded. */
	ready(): Promise<void> {
		return this.loaded;
	}

	private async load(): Promise<void> {
		try {
			const persisted = (await this.settings.getItem(STORE_KEY)) as
				| CachePolicy[]
				| null;
			const enabled = (await this.settings.getItem(ENABLED_KEY)) as
				| boolean
				| null;
			this.globalEnabled = enabled ?? true;

			if (Array.isArray(persisted) && persisted.length > 0) {
				for (const p of persisted) this.upsertInMemory(p);
			} else {
				// First run: install the catch-all default.
				const def: CachePolicy = {
					id: DEFAULT_POLICY_ID,
					hostPatterns: ['*'],
					cacheName: DEFAULT_CACHE_NAME,
					enabled: true,
					createdAt: Date.now()
				};
				this.upsertInMemory(def);
				await this.persist();
			}
		} catch (err) {
			console.warn('[cachePolicyRegistry] load failed:', err);
			// Fall back to in-memory default.
			if (this.compiled.length === 0) {
				this.upsertInMemory({
					id: DEFAULT_POLICY_ID,
					hostPatterns: ['*'],
					cacheName: DEFAULT_CACHE_NAME,
					enabled: true,
					createdAt: Date.now()
				});
			}
		}
	}

	private async persist(): Promise<void> {
		try {
			const list = this.list();
			await this.settings.setItem(STORE_KEY, list);
			await this.settings.setItem(ENABLED_KEY, this.globalEnabled);
		} catch (err) {
			console.warn('[cachePolicyRegistry] persist failed:', err);
		}
	}

	private upsertInMemory(p: CachePolicy): void {
		const matchers = p.hostPatterns.map((pattern) => ({
			pattern,
			test: compileHostPattern(pattern),
			specificity: policySpecificity(pattern)
		}));
		const maxSpecificity = matchers.reduce(
			(acc, m) => (m.specificity > acc ? m.specificity : acc),
			0
		);
		const entry: CompiledPolicy = { policy: p, matchers, maxSpecificity };

		const idx = this.compiled.findIndex((c) => c.policy.id === p.id);
		if (idx === -1) {
			this.compiled.push(entry);
			this.order.push(p.id);
		} else {
			this.compiled[idx] = entry;
		}
	}

	// ---------- public API ----------

	isEnabled(): boolean {
		return this.globalEnabled;
	}

	async setEnabled(enabled: boolean): Promise<void> {
		await this.loaded;
		this.globalEnabled = enabled;
		await this.persist();
	}

	async register(input: CachePolicyInput): Promise<CachePolicy> {
		await this.loaded;
		const policy: CachePolicy = {
			id: input.id,
			hostPatterns: [...input.hostPatterns],
			cacheName: input.cacheName ?? DEFAULT_CACHE_NAME,
			enabled: input.enabled ?? true,
			createdAt: Date.now()
		};
		this.upsertInMemory(policy);
		await this.persist();
		return policy;
	}

	async unregister(id: string): Promise<boolean> {
		await this.loaded;
		const idx = this.compiled.findIndex((c) => c.policy.id === id);
		if (idx === -1) return false;
		this.compiled.splice(idx, 1);
		const orderIdx = this.order.indexOf(id);
		if (orderIdx !== -1) this.order.splice(orderIdx, 1);
		await this.persist();
		return true;
	}

	list(): CachePolicy[] {
		// Preserve insertion order.
		const byId = new Map(this.compiled.map((c) => [c.policy.id, c.policy]));
		const out: CachePolicy[] = [];
		for (const id of this.order) {
			const p = byId.get(id);
			if (p) out.push({ ...p, hostPatterns: [...p.hostPatterns] });
		}
		return out;
	}

	get(id: string): CachePolicy | null {
		const c = this.compiled.find((x) => x.policy.id === id);
		return c
			? { ...c.policy, hostPatterns: [...c.policy.hostPatterns] }
			: null;
	}

	/**
	 * Resolve the matching policy for a URL.
	 *
	 * Specificity wins; insertion order breaks ties. A returned policy
	 * with `enabled: false` is a "negative rule" — caller should not
	 * cache for that URL.
	 */
	policyFor(url: string | URL): CachePolicy | null {
		let host: string;
		try {
			host = normalizeHost(
				typeof url === 'string' ? new URL(url).hostname : url.hostname
			);
		} catch {
			return null;
		}
		if (!host) return null;

		let best: { entry: CompiledPolicy; specificity: number; orderIdx: number } | null =
			null;
		for (const entry of this.compiled) {
			let bestForEntry = -1;
			for (const m of entry.matchers) {
				if (m.test(host) && m.specificity > bestForEntry) {
					bestForEntry = m.specificity;
				}
			}
			if (bestForEntry < 0) continue;
			const orderIdx = this.order.indexOf(entry.policy.id);
			if (
				!best ||
				bestForEntry > best.specificity ||
				(bestForEntry === best.specificity && orderIdx < best.orderIdx)
			) {
				best = { entry, specificity: bestForEntry, orderIdx };
			}
		}
		if (!best) return null;
		return {
			...best.entry.policy,
			hostPatterns: [...best.entry.policy.hostPatterns]
		};
	}
}
