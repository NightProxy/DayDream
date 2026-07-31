import type { ProfileAppearance, ProfileMetadata } from "./types";

export function generateProfileId(): string {
	const random =
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	return `p_${random.replace(/-/g, "").slice(0, 24)}`;
}

export function createProfileMetadata(input: {
	name: string;
	id?: string;
	appearance?: ProfileAppearance;
	originalId?: string;
}): ProfileMetadata {
	const now = Date.now();
	return {
		id: input.id ?? generateProfileId(),
		originalId: input.originalId,
		name: input.name,
		appearance: input.appearance,
		createdAt: now,
		updatedAt: now,
		version: 3,
	};
}

export function touchProfileMetadata(
	metadata: ProfileMetadata,
	patch: Partial<Omit<ProfileMetadata, "id" | "version" | "createdAt">> = {},
): ProfileMetadata {
	return {
		...metadata,
		...patch,
		id: metadata.id,
		version: 3,
		createdAt: metadata.createdAt,
		updatedAt: Date.now(),
	};
}
