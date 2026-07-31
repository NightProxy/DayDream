import type {
	ProfileStorage,
	ProfileStorageBackendKind,
	StorageRoot
} from '../profileStorage';
import { bucketName } from '../profileStorage';

async function getOrCreateDirectory(
	root: FileSystemDirectoryHandle,
	path: string[]
): Promise<FileSystemDirectoryHandle> {
	let current = root;
	for (const segment of path) {
		current = await current.getDirectoryHandle(segment, { create: true });
	}
	return current;
}

async function removeDirectoryRecursive(
	parent: FileSystemDirectoryHandle,
	name: string
): Promise<void> {
	try {
		await parent.removeEntry(name, { recursive: true });
	} catch (error) {
		if ((error as DOMException)?.name !== 'NotFoundError') throw error;
	}
}

export class OpfsSubdirProfileStorage implements ProfileStorage {
	readonly kind: ProfileStorageBackendKind = 'opfs-subdir';
	private readonly profileRoots = new Map<string, Promise<StorageRoot>>();
	private readonly originRoots = new Map<string, Promise<StorageRoot>>();
	private appRoot: Promise<StorageRoot> | undefined;
	private rootHandle: Promise<FileSystemDirectoryHandle> | undefined;

	private getRoot(): Promise<FileSystemDirectoryHandle> {
		this.rootHandle ??= navigator.storage.getDirectory();
		return this.rootHandle;
	}

	getAppRoot(): Promise<StorageRoot> {
		this.appRoot ??= (async () => {
			const root = await this.getRoot();
			const handle = await getOrCreateDirectory(root, ['app']);
			return wrapDirectory(handle, '__app__');
		})();
		return this.appRoot;
	}

	getProfileRoot(profileId: string): Promise<StorageRoot> {
		let pending = this.profileRoots.get(profileId);
		if (!pending) {
			pending = (async () => {
				const root = await this.getRoot();
				const hashed = await bucketName('profile', profileId);
				const handle = await getOrCreateDirectory(root, [
					'profiles',
					hashed
				]);
				return wrapDirectory(handle, profileId);
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
				const root = await this.getRoot();
				const profileHash = await bucketName('profile', profileId);
				const originHash = await bucketName('site', targetOrigin);
				const handle = await getOrCreateDirectory(root, [
					'profiles',
					profileHash,
					'sites',
					originHash
				]);
				return wrapDirectory(handle, profileId, targetOrigin);
			})();
			this.originRoots.set(key, pending);
		}
		return pending;
	}

	async destroyProfile(profileId: string): Promise<void> {
		const root = await this.getRoot();
		const hashed = await bucketName('profile', profileId);
		this.profileRoots.delete(profileId);
		for (const key of Array.from(this.originRoots.keys())) {
			if (key.startsWith(`${profileId}\0`)) {
				this.originRoots.delete(key);
			}
		}
		try {
			const profilesDir = await getOrCreateDirectory(root, ['profiles']);
			await removeDirectoryRecursive(profilesDir, hashed);
		} catch (error) {
			console.warn('[opfsSubdir] destroyProfile failed', error);
		}
	}

	async listPhysicalProfiles(): Promise<string[]> {
		return [];
	}
}

function wrapDirectory(
	handle: FileSystemDirectoryHandle,
	profileId: string,
	originScope?: string
): StorageRoot {
	return {
		kind: 'opfs-subdir',
		profileId,
		originScope,
		caches: undefined,
		indexedDB: undefined,
		getDirectory: async () => handle
	};
}
