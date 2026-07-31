import { SettingsAPI } from "@apis/settings";
import { createProfileStorage, type ProfileStorage } from "@apis/data/profileStorage";
import { EXTENSIONS_MANIFEST_FILE } from "./constants";
import type {
	ProfileExtensionEntry,
	ProfileExtensionsManifest,
} from "./types";

/**
 * Per-profile extension host.
 *
 * Owns the profile-scoped `extensions/manifest.json` and the state
 * subdirectories under `extensions/state/<extensionId>/`. Packages live
 * in the shared app bucket and are content-addressed by
 * `<extensionId>/<version>/` — this class does not fetch packages, it
 * only tracks which packages are enabled for a given profile.
 */
export class ProfileExtensionHost {
	private readonly storagePromise: Promise<ProfileStorage>;

	constructor(storage?: ProfileStorage) {
		this.storagePromise = storage
			? Promise.resolve(storage)
			: createProfileStorage();
	}

	private manifestApi(profileId: string): SettingsAPI {
		return new SettingsAPI({
			file: `/${EXTENSIONS_MANIFEST_FILE}`,
			folder: "/extensions",
			profileId,
		});
	}

	async readManifest(profileId: string): Promise<ProfileExtensionsManifest> {
		const api = this.manifestApi(profileId);
		const raw =
			(await api.getItem<ProfileExtensionsManifest>("manifest")) ?? null;
		if (raw && raw.version === 3) return raw;
		return { enabled: [], disabled: [], version: 3 };
	}

	async writeManifest(
		profileId: string,
		manifest: ProfileExtensionsManifest,
	): Promise<void> {
		const api = this.manifestApi(profileId);
		await api.setItem("manifest", manifest);
	}

	async list(profileId: string): Promise<ProfileExtensionEntry[]> {
		const manifest = await this.readManifest(profileId);
		return [...manifest.enabled, ...manifest.disabled];
	}

	async install(
		profileId: string,
		entry: Omit<ProfileExtensionEntry, "installedAt" | "updatedAt">,
	): Promise<ProfileExtensionEntry> {
		const manifest = await this.readManifest(profileId);
		const now = Date.now();
		const filled: ProfileExtensionEntry = {
			...entry,
			installedAt: now,
			updatedAt: now,
		};
		const list = filled.enabled ? manifest.enabled : manifest.disabled;
		const other = filled.enabled ? manifest.disabled : manifest.enabled;
		const dedupedList = list.filter((e) => e.id !== filled.id);
		const dedupedOther = other.filter((e) => e.id !== filled.id);
		dedupedList.push(filled);
		await this.writeManifest(profileId, {
			enabled: filled.enabled ? dedupedList : dedupedOther,
			disabled: filled.enabled ? dedupedOther : dedupedList,
			version: 3,
		});
		return filled;
	}

	async setEnabled(
		profileId: string,
		extensionId: string,
		enabled: boolean,
	): Promise<void> {
		const manifest = await this.readManifest(profileId);
		const source = enabled ? manifest.disabled : manifest.enabled;
		const target = enabled ? manifest.enabled : manifest.disabled;
		const found = source.find((e) => e.id === extensionId);
		if (!found) return;
		const next = { ...found, enabled, updatedAt: Date.now() };
		await this.writeManifest(profileId, {
			enabled: enabled
				? [...target, next]
				: target.filter((e) => e.id !== extensionId),
			disabled: enabled
				? source.filter((e) => e.id !== extensionId)
				: [...target, next],
			version: 3,
		});
	}

	async uninstall(profileId: string, extensionId: string): Promise<void> {
		const manifest = await this.readManifest(profileId);
		await this.writeManifest(profileId, {
			enabled: manifest.enabled.filter((e) => e.id !== extensionId),
			disabled: manifest.disabled.filter((e) => e.id !== extensionId),
			version: 3,
		});
	}

	async updateGrants(
		profileId: string,
		extensionId: string,
		grants: string[],
	): Promise<void> {
		const manifest = await this.readManifest(profileId);
		const update = (list: ProfileExtensionEntry[]) =>
			list.map((e) =>
				e.id === extensionId ? { ...e, grants, updatedAt: Date.now() } : e,
			);
		await this.writeManifest(profileId, {
			enabled: update(manifest.enabled),
			disabled: update(manifest.disabled),
			version: 3,
		});
	}

	/** Resolve the shared app-bucket directory that stores extension packages. */
	async getPackagesRoot(): Promise<FileSystemDirectoryHandle> {
		const storage = await this.storagePromise;
		const app = await storage.getAppRoot();
		const root = await app.getDirectory();
		return root.getDirectoryHandle("extensions", { create: true });
	}
}
