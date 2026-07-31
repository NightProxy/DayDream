import { SettingsAPI } from "@apis/settings";
import { createProfileStorage, type ProfileStorage } from "@apis/data/profileStorage";
import { getProfileBroadcast, type ProfileBroadcast } from "@apis/data/profileBroadcast";
import { ProfileRegistry } from "./registry";
import { ProfileExtensionHost } from "./extensions";
import { createProfileMetadata, touchProfileMetadata } from "./metadata";
import {
	parseArchive,
	serializeArchive,
	ARCHIVE_FORMAT,
	ARCHIVE_VERSION,
} from "./archive";
import {
	PROFILE_METADATA_FILE,
	PROFILE_SETTINGS_FILE,
} from "./constants";
import type {
	DatabaseExport,
	ProfileAppearance,
	ProfileArchiveV3,
	ProfileData,
	ProfileExport,
	ProfileExtensionEntry,
	ProfileMetadata,
	ProfileSiteState,
} from "./types";

export interface ProfilesAPIOptions {
	canExceedProfileLimit?: (() => boolean | Promise<boolean>) | null;
	maxProfiles?: number;
	storage?: ProfileStorage;
	registry?: ProfileRegistry;
	broadcast?: ProfileBroadcast;
}

type LegacyCtorArgs = [
	(() => boolean | Promise<boolean>) | null | undefined,
	number | undefined,
];

class ProfilesAPI {
	private readonly canExceed: (() => boolean | Promise<boolean>) | null;
	private readonly maxProfiles: number;
	private readonly registry: ProfileRegistry;
	private readonly broadcast: ProfileBroadcast;
	private readonly storagePromise: Promise<ProfileStorage>;
	private readonly extensionHost: ProfileExtensionHost;
	private activeProfileId: string | null = null;
	private readonly changeListeners = new Set<() => void>();
	public readonly initPromise: Promise<void>;

	constructor(
		optionsOrLegacy: ProfilesAPIOptions | LegacyCtorArgs[0] = null,
		legacyMax: number = 3,
	) {
		let options: ProfilesAPIOptions;
		if (
			typeof optionsOrLegacy === "function" ||
			optionsOrLegacy === null
		) {
			options = {
				canExceedProfileLimit: optionsOrLegacy ?? null,
				maxProfiles: legacyMax,
			};
		} else {
			options = optionsOrLegacy;
		}
		this.canExceed = options.canExceedProfileLimit ?? null;
		this.maxProfiles = options.maxProfiles ?? 3;
		this.registry = options.registry ?? new ProfileRegistry();
		this.broadcast = options.broadcast ?? getProfileBroadcast();
		this.storagePromise = options.storage
			? Promise.resolve(options.storage)
			: createProfileStorage();
		this.extensionHost = new ProfileExtensionHost(options.storage);

		this.initPromise = this.initialize();
		this.broadcast.subscribe((message) => {
			if (message.type === "active-changed") {
				this.activeProfileId = message.id;
				this.notifyChange();
			} else if (
				message.type === "profile-created" ||
				message.type === "profile-destroyed" ||
				message.type === "profile-updated"
			) {
				this.registry.reset();
				this.notifyChange();
			}
		});
	}

	private async initialize(): Promise<void> {
		try {
			try {
				const { runLegacyMigration } = await import("./legacyMigration");
				await runLegacyMigration(this.registry);
			} catch (error) {
				console.warn("[ProfilesAPI] legacy migration failed:", error);
			}
			this.activeProfileId = await this.registry.getActiveId();
		} catch (error) {
			console.error("[ProfilesAPI] initialize failed:", error);
		}
	}

	onChange(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => {
			this.changeListeners.delete(listener);
		};
	}

	private notifyChange(): void {
		for (const fn of this.changeListeners) {
			try {
				fn();
			} catch (error) {
				console.error("[ProfilesAPI] listener error", error);
			}
		}
	}

	// ---------------------------------------------------------------------
	// v3 primary API
	// ---------------------------------------------------------------------

	async list(): Promise<ProfileMetadata[]> {
		return this.registry.list();
	}

	async get(id: string): Promise<ProfileMetadata | null> {
		return this.registry.get(id);
	}

	getActiveId(): string | null {
		return this.activeProfileId;
	}

	async create(input: {
		name: string;
		id?: string;
		appearance?: ProfileAppearance;
	}): Promise<ProfileMetadata> {
		if (!input?.name || typeof input.name !== "string") {
			throw new Error("create requires a non-empty name");
		}
		const count = await this.registry.count();
		if (count >= this.maxProfiles) {
			const allowed = this.canExceed ? await this.canExceed() : false;
			if (!allowed) {
				throw new Error(
					`Maximum number of profiles (${this.maxProfiles}) reached. Upgrade to Night+ for unlimited profiles.`,
				);
			}
		}
		let id = input.id ?? undefined;
		if (id && (await this.registry.get(id))) {
			id = undefined;
		}
		const metadata = createProfileMetadata({
			name: input.name,
			id,
			appearance: input.appearance,
			originalId: input.id && input.id !== id ? input.id : undefined,
		});
		await this.registry.upsert(metadata);
		await this.writeMetadataFile(metadata);
		this.broadcast.publish({ type: "profile-created", id: metadata.id });
		this.notifyChange();
		return metadata;
	}

	async rename(id: string, name: string): Promise<ProfileMetadata> {
		const existing = await this.registry.get(id);
		if (!existing) throw new Error(`Profile ${id} does not exist`);
		const updated = touchProfileMetadata(existing, { name });
		await this.registry.upsert(updated);
		await this.writeMetadataFile(updated);
		this.broadcast.publish({ type: "profile-updated", id });
		this.notifyChange();
		return updated;
	}

	async setAppearance(
		id: string,
		appearance: ProfileAppearance,
	): Promise<ProfileMetadata> {
		const existing = await this.registry.get(id);
		if (!existing) throw new Error(`Profile ${id} does not exist`);
		const updated = touchProfileMetadata(existing, { appearance });
		await this.registry.upsert(updated);
		await this.writeMetadataFile(updated);
		this.broadcast.publish({ type: "profile-updated", id });
		this.notifyChange();
		return updated;
	}

	async destroy(id: string): Promise<void> {
		if (this.activeProfileId === id) {
			throw new Error(
				"Cannot destroy the active profile. Switch to another profile first.",
			);
		}
		const removed = await this.registry.remove(id);
		if (!removed) return;
		const storage = await this.storagePromise;
		await storage.destroyProfile(id).catch((error) => {
			console.warn(`[ProfilesAPI] destroyProfile ${id} storage failed`, error);
		});
		this.broadcast.publish({ type: "profile-destroyed", id });
		this.notifyChange();
	}

	async setActive(id: string): Promise<void> {
		const metadata = await this.registry.get(id);
		if (!metadata) throw new Error(`Profile ${id} does not exist`);
		this.activeProfileId = id;
		await this.registry.setActiveId(id);
		this.broadcast.publish({ type: "active-changed", id });
		this.notifyChange();
	}

	async listExtensions(
		profileId: string = this.activeProfileId ?? "",
	): Promise<ProfileExtensionEntry[]> {
		if (!profileId) return [];
		return this.extensionHost.list(profileId);
	}

	async installExtension(
		profileId: string,
		entry: Omit<ProfileExtensionEntry, "installedAt" | "updatedAt">,
	): Promise<ProfileExtensionEntry> {
		return this.extensionHost.install(profileId, entry);
	}

	async setExtensionEnabled(
		profileId: string,
		extensionId: string,
		enabled: boolean,
	): Promise<void> {
		return this.extensionHost.setEnabled(profileId, extensionId, enabled);
	}

	async uninstallExtension(
		profileId: string,
		extensionId: string,
	): Promise<void> {
		return this.extensionHost.uninstall(profileId, extensionId);
	}

	async updateExtensionGrants(
		profileId: string,
		extensionId: string,
		grants: string[],
	): Promise<void> {
		return this.extensionHost.updateGrants(profileId, extensionId, grants);
	}

	settings(): SettingsAPI {
		const profileId = this.activeProfileId;
		if (!profileId) {
			return new SettingsAPI();
		}
		return new SettingsAPI({
			file: `/${PROFILE_SETTINGS_FILE}`,
			folder: "/",
			profileId,
		});
	}

	async clearActiveData(): Promise<void> {
		if (!this.activeProfileId) return;
		const id = this.activeProfileId;
		const storage = await this.storagePromise;
		await storage.destroyProfile(id).catch((error) => {
			console.warn(`[ProfilesAPI] clearActiveData ${id} failed`, error);
		});
		const metadata = await this.registry.get(id);
		if (metadata) await this.writeMetadataFile(metadata);
		this.broadcast.publish({ type: "profile-updated", id });
		this.notifyChange();
	}

	async export(id: string): Promise<ProfileArchiveV3> {
		const metadata = await this.registry.get(id);
		if (!metadata) throw new Error(`Profile ${id} does not exist`);
		return {
			format: ARCHIVE_FORMAT,
			version: ARCHIVE_VERSION,
			metadata,
			files: {},
			sites: {},
		};
	}

	async exportToBlob(id: string): Promise<Blob> {
		const archive = await this.export(id);
		const json = serializeArchive(archive);
		return new Blob([json], { type: "application/json" });
	}

	async import(
		archive: ProfileArchiveV3,
		opts: { rename?: string } = {},
	): Promise<ProfileMetadata> {
		const desiredName = opts.rename ?? archive.metadata.name;
		let id: string | undefined = archive.metadata.id;
		let originalId: string | undefined;
		if (id && (await this.registry.get(id))) {
			originalId = id;
			id = undefined;
		}
		const metadata = createProfileMetadata({
			name: desiredName,
			id,
			appearance: archive.metadata.appearance,
			originalId: originalId ?? archive.metadata.originalId,
		});
		await this.registry.upsert(metadata);
		await this.writeMetadataFile(metadata);
		this.broadcast.publish({ type: "profile-created", id: metadata.id });
		this.notifyChange();
		return metadata;
	}

	async importFromBlob(
		blob: Blob,
		opts: { rename?: string } = {},
	): Promise<ProfileMetadata> {
		const text = await blob.text();
		const { archive } = parseArchive(text, opts.rename);
		return this.import(archive, opts);
	}

	private async writeMetadataFile(metadata: ProfileMetadata): Promise<void> {
		try {
			const api = new SettingsAPI({
				file: `/${PROFILE_METADATA_FILE}`,
				folder: "/",
				profileId: metadata.id,
			});
			await api.setItem("metadata", metadata);
		} catch (error) {
			console.warn(
				`[ProfilesAPI] failed to persist profile.json for ${metadata.id}`,
				error,
			);
		}
	}

	// ---------------------------------------------------------------------
	// v2 compatibility shims (call sites migrate incrementally)
	// ---------------------------------------------------------------------

	/** @deprecated Use list(). */
	async listProfiles(): Promise<string[]> {
		const all = await this.registry.list();
		return all.map((m) => m.id);
	}

	/** @deprecated Use getActiveId(). */
	getCurrentProfile(): string | null {
		return this.activeProfileId;
	}

	/** @deprecated Use get(). */
	async profileExists(userID: string): Promise<boolean> {
		return (await this.registry.get(userID)) !== null;
	}

	/** @deprecated Use get(). */
	async getProfileData(userID: string): Promise<ProfileData | null> {
		const meta = await this.registry.get(userID);
		if (!meta) return null;
		return {
			cookies: {},
			localStorage: {},
			indexedDB: [],
			version: 3,
			timestamp: meta.updatedAt,
			appearance: meta.appearance,
		};
	}

	/** @deprecated Use create(). */
	async createProfile(userID: string): Promise<boolean> {
		await this.create({ name: userID, id: userID });
		return true;
	}

	/** @deprecated Use create() + setActive(). */
	async createProfileWithCurrentData(userID: string): Promise<boolean> {
		const meta = await this.create({ name: userID, id: userID });
		await this.setActive(meta.id);
		return true;
	}

	/** @deprecated Use destroy(). */
	async deleteProfile(userID: string): Promise<boolean> {
		await this.destroy(userID);
		return true;
	}

	/** @deprecated Use rename(). */
	async renameProfile(oldId: string, newId: string): Promise<boolean> {
		const meta = await this.registry.get(oldId);
		if (!meta) return false;
		await this.rename(oldId, newId);
		return true;
	}

	/** @deprecated Use setAppearance(). */
	async updateProfileAppearance(
		userID: string,
		appearance: ProfileAppearance,
	): Promise<boolean> {
		await this.setAppearance(userID, appearance);
		return true;
	}

	/** @deprecated v3 stores per-profile data automatically; save is a no-op. */
	async saveProfile(userID: string): Promise<boolean> {
		const meta = await this.registry.get(userID);
		if (!meta) return false;
		return true;
	}

	/** @deprecated Use setActive(). */
	async switchProfile(
		userID: string,
		_skipCurrentSave: boolean = false,
	): Promise<boolean> {
		await this.setActive(userID);
		return true;
	}

	/** @deprecated No-op in v3; live browser state is proxied per-profile. */
	async getCurrentBrowserState(): Promise<ProfileData> {
		return {
			cookies: {},
			localStorage: {},
			indexedDB: [],
			version: 3,
			timestamp: Date.now(),
		};
	}

	/** @deprecated No-op in v3. */
	async applyBrowserState(_state: ProfileData): Promise<void> {
		return;
	}

	/** @deprecated Use clearActiveData(). */
	async clearCurrentProfileData(): Promise<boolean> {
		await this.clearActiveData();
		return true;
	}

	/** @deprecated No-op in v3. */
	async flushStorageOperations(): Promise<void> {
		return;
	}

	/** @deprecated No-op in v3; per-profile OPFS already isolates state. */
	emergencySaveProfile(_userID: string): boolean {
		return true;
	}

	/** @deprecated Use export(). */
	async exportCurrentProfile(): Promise<ProfileExport> {
		const id = this.activeProfileId;
		return {
			profileId: id,
			timestamp: new Date().toISOString(),
			indexedDB: [],
			localStorage: {},
			cookies: {},
		};
	}

	/** @deprecated Use exportToBlob() + your own download flow. */
	async downloadExport(filename: string | null = null): Promise<boolean> {
		const id = this.activeProfileId;
		if (!id) return false;
		const blob = await this.exportToBlob(id);
		const url = URL.createObjectURL(blob);
		try {
			const link = document.createElement("a");
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			link.href = url;
			link.download = filename ?? `profile-export-${id}-${timestamp}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			return true;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	/** @deprecated Removed in v3; kept as identity stub. */
	encode(data: any): string {
		return JSON.stringify(data);
	}

	/** @deprecated Removed in v3; kept as identity stub. */
	decode(encodedData: string): any {
		try {
			return JSON.parse(encodedData);
		} catch {
			return null;
		}
	}

	// The following v2 helpers touched the host stores directly. In v3 those
	// are proxied per-profile; the shims are retained as no-ops so callers
	// migrating in stages do not crash.

	/** @deprecated */
	async exportIndexedDBs(): Promise<DatabaseExport[]> {
		return [];
	}
	/** @deprecated */
	async setIDBDataLegacy(_data: Record<string, any>): Promise<void> {}
	/** @deprecated */
	async getAllCookies(): Promise<Record<string, string>> {
		return {};
	}
	/** @deprecated */
	async setCookies(_cookies: Record<string, string>): Promise<void> {}
	/** @deprecated */
	async clearAllCookies(): Promise<void> {}
	/** @deprecated */
	async getAllLocalStorage(): Promise<Record<string, string>> {
		return {};
	}
	/** @deprecated */
	async setLocalStorage(_data: Record<string, string>): Promise<void> {}
	/** @deprecated */
	async clearAllLocalStorage(): Promise<void> {}
	/** @deprecated */
	async getAllIDBData(): Promise<DatabaseExport[]> {
		return [];
	}
	/** @deprecated */
	async setIDBData(_databases: DatabaseExport[]): Promise<void> {}
	/** @deprecated */
	async clearAllIDB(): Promise<void> {}

	// Site-scoped helpers (v3): expose per-origin state for the active profile.
	async getSiteState(
		targetOrigin: string,
		profileId: string = this.activeProfileId ?? "",
	): Promise<ProfileSiteState | null> {
		if (!profileId) return null;
		const storage = await this.storagePromise;
		try {
			await storage.getOriginRoot(profileId, targetOrigin);
			return {};
		} catch (error) {
			console.warn("[ProfilesAPI] getSiteState failed", error);
			return null;
		}
	}
}

export { ProfilesAPI };
