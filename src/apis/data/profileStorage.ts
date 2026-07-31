export type ProfileStorageBackendKind = 'bucket' | 'opfs-subdir' | 'idb-shim';

export interface StorageRoot {
	getDirectory(): Promise<FileSystemDirectoryHandle>;
	/** Undefined when the backend cannot supply an isolated CacheStorage. */
	readonly caches?: CacheStorage;
	/** Undefined when the backend cannot supply an isolated IDBFactory. */
	readonly indexedDB?: IDBFactory;
	readonly kind: ProfileStorageBackendKind;
	readonly profileId: string;
	/** Optional, set for per-origin sub-roots. */
	readonly originScope?: string;
}

export interface ProfileStorage {
	readonly kind: ProfileStorageBackendKind;
	/** Resolves the storage root for a profile, creating it on first use. */
	getProfileRoot(profileId: string): Promise<StorageRoot>;
	/** Resolves the per-target-origin sub-root inside a profile. */
	getOriginRoot(profileId: string, targetOrigin: string): Promise<StorageRoot>;
	/** Resolves a shared "app" root not tied to any profile (registry, extension packages). */
	getAppRoot(): Promise<StorageRoot>;
	/** Removes a profile's entire storage tree; irreversible. */
	destroyProfile(profileId: string): Promise<void>;
	/** Enumerates profile ids the backend has physically created (best effort). */
	listPhysicalProfiles(): Promise<string[]>;
}

const BUCKET_KEY_FALLBACK = '36f11d8095a74ce28b6304f9e217c5aa';

function resolveBucketKey(): string {
	try {
		const injected = (globalThis as { __DAYDREAM_BUCKET_KEY__?: string })
			.__DAYDREAM_BUCKET_KEY__;
		if (typeof injected === 'string' && injected.length > 0) return injected;
	} catch {
		// fall through to fallback
	}
	return BUCKET_KEY_FALLBACK;
}

export async function bucketName(...parts: string[]): Promise<string> {
	const origin =
		typeof location !== 'undefined' && location?.origin
			? location.origin
			: '';
	const input = new TextEncoder().encode(
		[origin, resolveBucketKey(), ...parts].join(String.fromCharCode(0))
	);
	const digest = await crypto.subtle.digest('SHA-256', input);
	return Array.from(new Uint8Array(digest), b =>
		b.toString(16).padStart(2, '0')
	)
		.join('')
		.slice(0, 56);
}

let cached: Promise<ProfileStorage> | undefined;

export function createProfileStorage(): Promise<ProfileStorage> {
	cached ??= (async () => {
		const bucketManager = (
			typeof navigator !== 'undefined'
				? (navigator as Navigator & { storageBuckets?: unknown }).storageBuckets
				: undefined
		) as { open?: (name: string) => Promise<unknown> } | undefined;
		if (bucketManager && typeof bucketManager.open === 'function') {
			const { BucketProfileStorage } = await import(
				'./backends/bucketBackend'
			);
			try {
				await requestPersist();
			} catch {
				// best effort
			}
			return new BucketProfileStorage();
		}
		if (
			typeof navigator !== 'undefined' &&
			typeof (navigator.storage as Partial<StorageManager>).getDirectory ===
				'function'
		) {
			const { OpfsSubdirProfileStorage } = await import(
				'./backends/opfsSubdirBackend'
			);
			try {
				await requestPersist();
			} catch {
				// best effort
			}
			return new OpfsSubdirProfileStorage();
		}
		const { IdbShimProfileStorage } = await import(
			'./backends/idbShimBackend'
		);
		return new IdbShimProfileStorage();
	})();
	return cached;
}

async function requestPersist(): Promise<void> {
	if (typeof navigator === 'undefined') return;
	const storage = navigator.storage as StorageManager | undefined;
	if (!storage?.persist) return;
	try {
		if (storage.persisted && (await storage.persisted())) return;
		await storage.persist();
	} catch {
		// best effort
	}
}

/** Test-only helper to reset the cached backend instance. */
export function __resetProfileStorageForTests(): void {
	cached = undefined;
}
