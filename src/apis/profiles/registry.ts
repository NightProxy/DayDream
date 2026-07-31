import { SettingsAPI } from "@apis/settings";
import {
	PROFILE_VERSION,
	REGISTRY_FILE,
	REGISTRY_FOLDER,
} from "./constants";
import type { ProfileMetadata, ProfileRegistryDocument } from "./types";

const REGISTRY_KEY = "registry";

/**
 * Persistent list of known profiles + active-profile pointer.
 * Stored in the app-scope storage bucket (not inside any profile bucket).
 */
export class ProfileRegistry {
	private readonly store: SettingsAPI;
	private cache: ProfileRegistryDocument | undefined;
	private loadPromise: Promise<ProfileRegistryDocument> | undefined;

	constructor(store?: SettingsAPI) {
		this.store =
			store ??
			new SettingsAPI(REGISTRY_FILE, REGISTRY_FOLDER);
	}

	async load(): Promise<ProfileRegistryDocument> {
		if (this.cache) return this.cache;
		if (!this.loadPromise) {
			this.loadPromise = (async () => {
				const raw =
					(await this.store.getItem<ProfileRegistryDocument>(
						REGISTRY_KEY,
					)) ?? null;
				const doc: ProfileRegistryDocument = raw && raw.version === 3
					? raw
					: {
							profiles: {},
							activeProfileId: null,
							version: PROFILE_VERSION,
						};
				this.cache = doc;
				return doc;
			})();
		}
		return this.loadPromise;
	}

	async save(): Promise<void> {
		if (!this.cache) return;
		await this.store.setItem(REGISTRY_KEY, this.cache);
	}

	async list(): Promise<ProfileMetadata[]> {
		const doc = await this.load();
		return Object.values(doc.profiles);
	}

	async get(id: string): Promise<ProfileMetadata | null> {
		const doc = await this.load();
		return doc.profiles[id] ?? null;
	}

	async getActiveId(): Promise<string | null> {
		const doc = await this.load();
		return doc.activeProfileId;
	}

	async setActiveId(id: string | null): Promise<void> {
		const doc = await this.load();
		doc.activeProfileId = id;
		await this.save();
	}

	async upsert(metadata: ProfileMetadata): Promise<ProfileMetadata> {
		const doc = await this.load();
		doc.profiles[metadata.id] = metadata;
		await this.save();
		return metadata;
	}

	async remove(id: string): Promise<boolean> {
		const doc = await this.load();
		if (!doc.profiles[id]) return false;
		delete doc.profiles[id];
		if (doc.activeProfileId === id) doc.activeProfileId = null;
		await this.save();
		return true;
	}

	async count(): Promise<number> {
		const doc = await this.load();
		return Object.keys(doc.profiles).length;
	}

	/** Test-only helper to drop the in-memory cache. */
	reset(): void {
		this.cache = undefined;
		this.loadPromise = undefined;
	}
}
