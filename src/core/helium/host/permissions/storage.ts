// src/core/helium/host/permissions/storage.ts
//
// Persistence layer for chrome.permissions.* optional-permission
// grants. Each extension keeps an `__helium_optional_perms__.json`
// file under its extfs tree storing the set of optional API
// permissions and host (origin) permissions the user has approved
// at runtime.

import { readExtensionFile, writeExtensionFile } from '../../extfs';

const FILE = '__helium_optional_perms__.json';

export interface OptionalGrants {
	permissions: string[];
	origins: string[];
}

interface StoredGrants {
	version: 1;
	permissions: string[];
	origins: string[];
}

/**
 * Load the persisted optional grants for an extension. Returns an
 * empty record if the file is missing or unparseable.
 */
export async function loadOptional(extId: string): Promise<OptionalGrants> {
	try {
		const bytes = await readExtensionFile(extId, FILE);
		if (!bytes) return { permissions: [], origins: [] };
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<StoredGrants>;
		if (parsed.version !== 1) return { permissions: [], origins: [] };
		const perms = Array.isArray(parsed.permissions)
			? parsed.permissions.filter((s): s is string => typeof s === 'string')
			: [];
		const origins = Array.isArray(parsed.origins)
			? parsed.origins.filter((s): s is string => typeof s === 'string')
			: [];
		return { permissions: perms, origins };
	} catch (err) {
		console.warn(`[helium/permissions] loadOptional(${extId}) failed:`, err);
		return { permissions: [], origins: [] };
	}
}

/**
 * Replace the persisted optional grants for an extension with the
 * given record. Deduplicates entries.
 */
export async function saveOptional(
	extId: string,
	grants: OptionalGrants,
): Promise<void> {
	const stored: StoredGrants = {
		version: 1,
		permissions: Array.from(new Set(grants.permissions)),
		origins: Array.from(new Set(grants.origins)),
	};
	try {
		await writeExtensionFile(
			extId,
			FILE,
			new TextEncoder().encode(JSON.stringify(stored)),
		);
	} catch (err) {
		console.warn(`[helium/permissions] saveOptional(${extId}) failed:`, err);
	}
}
