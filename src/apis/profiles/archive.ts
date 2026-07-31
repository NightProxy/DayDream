import type {
	ProfileArchiveV3,
	ProfileData,
	ProfileExport,
	ProfileMetadata,
	ProfileSiteState,
} from "./types";
import { createProfileMetadata } from "./metadata";

export const ARCHIVE_FORMAT = "daydream-profile" as const;
export const ARCHIVE_VERSION = 3 as const;

function sortedKeys<T extends Record<string, unknown>>(record: T): string[] {
	return Object.keys(record).sort();
}

function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) => {
		if (val && typeof val === "object" && !Array.isArray(val)) {
			const sorted: Record<string, unknown> = {};
			for (const key of sortedKeys(val as Record<string, unknown>)) {
				sorted[key] = (val as Record<string, unknown>)[key];
			}
			return sorted;
		}
		return val;
	});
}

export function serializeArchive(archive: ProfileArchiveV3): string {
	return stableStringify(archive);
}

export function isV3Archive(value: unknown): value is ProfileArchiveV3 {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as ProfileArchiveV3).format === ARCHIVE_FORMAT &&
		(value as ProfileArchiveV3).version === ARCHIVE_VERSION
	);
}

/**
 * Convert a v2 ProfileExport (or ProfileData) into a v3 archive.
 * v2 data is treated as a single site entry keyed by the wildcard origin "*".
 */
export function convertV2ToV3(
	input: ProfileExport | ProfileData,
	name: string,
): ProfileArchiveV3 {
	const site: ProfileSiteState = {
		cookies: input.cookies ?? {},
		localStorage: input.localStorage ?? {},
		indexedDB: input.indexedDB ?? [],
	};
	const metadata: ProfileMetadata = createProfileMetadata({
		name,
		appearance: input.appearance,
	});
	return {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		metadata,
		files: {},
		sites: { "*": site },
	};
}

export interface ParsedArchive {
	archive: ProfileArchiveV3;
	wasV2: boolean;
}

/**
 * Parse a JSON archive blob. Accepts v3 archives verbatim and upgrades v2
 * ProfileExport shapes on the fly. Throws on unrecognized input.
 */
export function parseArchive(json: string, fallbackName = "Imported Profile"): ParsedArchive {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (error) {
		throw new Error(
			`Profile archive is not valid JSON: ${(error as Error).message}`,
		);
	}
	if (isV3Archive(parsed)) {
		return { archive: parsed, wasV2: false };
	}
	if (parsed && typeof parsed === "object") {
		const v2 = parsed as Partial<ProfileExport>;
		if (
			Array.isArray(v2.indexedDB) ||
			typeof v2.localStorage === "object" ||
			typeof v2.cookies === "object"
		) {
			const name = v2.profileId ?? fallbackName;
			return {
				archive: convertV2ToV3(v2 as ProfileExport, name),
				wasV2: true,
			};
		}
	}
	throw new Error("Unrecognized profile archive format");
}
