import { SettingsAPI } from "@apis/settings";
import { ProfileRegistry } from "./registry";
import { createProfileMetadata } from "./metadata";
import {
	PROFILE_METADATA_FILE,
	PROFILE_SETTINGS_FILE,
} from "./constants";
import type { ProfileData, ProfileMetadata } from "./types";

const MIGRATION_MARKER_KEY = "__migrated_to_v3__";
const LEGACY_CURRENT_KEY = "__current_profile__";

interface LegacyMigrationResult {
	migrated: boolean;
	profiles: ProfileMetadata[];
	activeProfileId: string | null;
}

/**
 * Run once at boot: read the v2 `/data/profiles.json` and
 * `/data/settings.json`, promote each entry into a v3 profile bucket, and
 * mark the migration complete so subsequent boots skip.
 *
 * Safe to call multiple times; the marker is checked first.
 */
export async function runLegacyMigration(
	registry: ProfileRegistry = new ProfileRegistry(),
): Promise<LegacyMigrationResult> {
	const marker = new SettingsAPI("/registry.json", "/");
	const already = await marker.getItem<boolean>(MIGRATION_MARKER_KEY);
	if (already) {
		return {
			migrated: false,
			profiles: await registry.list(),
			activeProfileId: await registry.getActiveId(),
		};
	}

	const legacyProfiles = new SettingsAPI("/data/profiles.json", "/data");
	const legacySettings = new SettingsAPI("/data/settings.json", "/data");

	let legacyIds: string[] = [];
	try {
		legacyIds = await legacyProfiles.keys();
	} catch (error) {
		console.warn("[legacyMigration] no legacy profiles.json found", error);
	}

	const promoted: ProfileMetadata[] = [];
	let activeProfileId: string | null = null;

	for (const key of legacyIds) {
		if (key === LEGACY_CURRENT_KEY) continue;
		let legacyData: ProfileData | null = null;
		try {
			legacyData = await legacyProfiles.getItem<ProfileData>(key);
		} catch (error) {
			console.warn(`[legacyMigration] failed to read legacy profile ${key}`, error);
			continue;
		}
		if (!legacyData) continue;

		const metadata = createProfileMetadata({
			name: key,
			id: key,
			appearance: legacyData.appearance,
		});
		await registry.upsert(metadata);
		try {
			const api = new SettingsAPI({
				file: `/${PROFILE_METADATA_FILE}`,
				folder: "/",
				profileId: metadata.id,
			});
			await api.setItem("metadata", metadata);
			await api.setItem("legacyData", legacyData);
		} catch (error) {
			console.warn(
				`[legacyMigration] failed to write metadata for ${key}`,
				error,
			);
		}
		promoted.push(metadata);
	}

	try {
		const currentPointer = await legacyProfiles.getItem<string>(
			LEGACY_CURRENT_KEY,
		);
		if (currentPointer && (await registry.get(currentPointer))) {
			await registry.setActiveId(currentPointer);
			activeProfileId = currentPointer;
		}
	} catch (error) {
		console.warn("[legacyMigration] failed to read legacy active pointer", error);
	}

	try {
		const settingsKeys = await legacySettings.keys();
		if (settingsKeys.length > 0 && activeProfileId) {
			const target = new SettingsAPI({
				file: `/${PROFILE_SETTINGS_FILE}`,
				folder: "/",
				profileId: activeProfileId,
			});
			for (const key of settingsKeys) {
				try {
					const value = await legacySettings.getItem<unknown>(key);
					if (value !== null) await target.setItem(key, value);
				} catch (error) {
					console.warn(
						`[legacyMigration] failed to copy setting ${key}`,
						error,
					);
				}
			}
		}
	} catch (error) {
		console.warn("[legacyMigration] failed to enumerate legacy settings", error);
	}

	await marker.setItem(MIGRATION_MARKER_KEY, true);

	return {
		migrated: true,
		profiles: promoted,
		activeProfileId,
	};
}
