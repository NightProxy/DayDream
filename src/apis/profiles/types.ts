export interface ProfileAppearance {
	avatarType: "letter" | "icon" | "image";
	avatarIcon?: string;
	avatarImage?: string;
	color: string;
}

/** @deprecated Kept for v2 compatibility during migration. */
export interface ProfileData {
	cookies: Record<string, string>;
	localStorage: Record<string, string>;
	indexedDB: DatabaseExport[];
	version: number;
	timestamp: number;
	appearance?: ProfileAppearance;
}

export interface DatabaseExport {
	name: string;
	version: number;
	data: Record<string, any[]>;
}

/** @deprecated Superseded by ProfileArchiveV3. */
export interface ProfileExport {
	profileId: string | null;
	timestamp: string;
	indexedDB: DatabaseExport[];
	localStorage: Record<string, string>;
	cookies: Record<string, string>;
	appearance?: ProfileAppearance;
}

/**
 * V3 profile metadata. `id` is opaque and stable; `name` is user-visible and mutable.
 * Renaming does not change the id or move any storage.
 */
export interface ProfileMetadata {
	id: string;
	originalId?: string;
	name: string;
	appearance?: ProfileAppearance;
	createdAt: number;
	updatedAt: number;
	version: 3;
	extensionSummary?: Array<{ id: string; version: string; enabled: boolean }>;
}

export interface ProfileRegistryDocument {
	profiles: Record<string, ProfileMetadata>;
	activeProfileId: string | null;
	version: 3;
}

export interface ProfileExtensionEntry {
	id: string;
	version: string;
	enabled: boolean;
	grants: string[];
	installedAt: number;
	updatedAt: number;
	reason?: string;
}

export interface ProfileExtensionsManifest {
	enabled: ProfileExtensionEntry[];
	disabled: ProfileExtensionEntry[];
	version: 3;
}

export interface ProfileSiteState {
	cookies?: Record<string, string>;
	localStorage?: Record<string, string>;
	sessionStorage?: Record<string, string>;
	indexedDB?: DatabaseExport[];
}

export interface ProfileArchiveV3 {
	format: "daydream-profile";
	version: 3;
	metadata: ProfileMetadata;
	files: Record<string, { encoding: "utf8" | "base64"; content: string }>;
	sites: Record<string, ProfileSiteState>;
	extensions?: {
		manifest: ProfileExtensionsManifest;
		state: Record<
			string,
			{
				storageLocal?: Record<string, unknown>;
				idb?: DatabaseExport[];
			}
		>;
		packages?: Record<
			string,
			{ version: string; sha256: string; content?: string }
		>;
	};
	encryption?: { algorithm: string; params: Record<string, unknown> };
}
