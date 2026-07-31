import type {
	ProfileStorage,
	ProfileStorageBackendKind,
	StorageRoot
} from '../profileStorage';
import { bucketName } from '../profileStorage';

type OpaqueBucket = {
	getDirectory(): Promise<FileSystemDirectoryHandle>;
	caches: CacheStorage;
	indexedDB: IDBFactory;
};

type BucketManager = {
	open(name: string, options?: unknown): Promise<OpaqueBucket>;
	keys?(): Promise<string[]>;
	delete?(name: string): Promise<void>;
};

function getManager(): BucketManager {
	const manager = (
		navigator as Navigator & { storageBuckets?: BucketManager }
	).storageBuckets;
	if (!manager || typeof manager.open !== 'function') {
		throw new Error('Storage Buckets API is not available');
	}
	return manager;
}

export class BucketProfileStorage implements ProfileStorage {
	readonly kind: ProfileStorageBackendKind = 'bucket';
	private readonly profileRoots = new Map<string, Promise<StorageRoot>>();
	private readonly originRoots = new Map<string, Promise<StorageRoot>>();
	private appRoot: Promise<StorageRoot> | undefined;

	getAppRoot(): Promise<StorageRoot> {
		this.appRoot ??= (async () => {
			const manager = getManager();
			const name = await bucketName('app');
			const bucket = await manager.open(name);
			return wrapBucket(bucket, '__app__');
		})();
		return this.appRoot;
	}

	getProfileRoot(profileId: string): Promise<StorageRoot> {
		let pending = this.profileRoots.get(profileId);
		if (!pending) {
			pending = (async () => {
				const manager = getManager();
				const name = await bucketName('profile', profileId);
				const bucket = await manager.open(name);
				return wrapBucket(bucket, profileId);
			})();
			this.profileRoots.set(profileId, pending);
		}
		return pending;
	}

	getOriginRoot(
		profileId: string,
		targetOrigin: string
	): Promise<StorageRoot> {
		const key = `${profileId}\0${targetOrigin}`;
		let pending = this.originRoots.get(key);
		if (!pending) {
			pending = (async () => {
				const manager = getManager();
				const name = await bucketName('site', profileId, targetOrigin);
				const bucket = await manager.open(name);
				return wrapBucket(bucket, profileId, targetOrigin);
			})();
			this.originRoots.set(key, pending);
		}
		return pending;
	}

	async destroyProfile(profileId: string): Promise<void> {
		const manager = getManager();
		const name = await bucketName('profile', profileId);
		this.profileRoots.delete(profileId);
		for (const key of Array.from(this.originRoots.keys())) {
			if (key.startsWith(`${profileId}\0`)) {
				this.originRoots.delete(key);
			}
		}
		if (manager.delete) {
			await manager.delete(name).catch(() => undefined);
		}
	}

	async listPhysicalProfiles(): Promise<string[]> {
		return [];
	}
}

function wrapBucket(
	bucket: OpaqueBucket,
	profileId: string,
	originScope?: string
): StorageRoot {
	return {
		kind: 'bucket',
		profileId,
		originScope,
		caches: bucket.caches,
		indexedDB: bucket.indexedDB,
		getDirectory: () => bucket.getDirectory()
	};
}
