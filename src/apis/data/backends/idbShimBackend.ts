import type {
	ProfileStorage,
	ProfileStorageBackendKind,
	StorageRoot
} from '../profileStorage';

const DB_NAME = 'daydream_storage_shim';
const STORE = 'files';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('shim: openDb failed'));
	});
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('shim: request failed'));
	});
}

type ShimFile = { kind: 'file'; content: string };
type ShimDir = { kind: 'dir' };
type ShimEntry = ShimFile | ShimDir;

function joinKey(prefix: string, name: string): string {
	return prefix === '/' ? `/${name}` : `${prefix}/${name}`;
}

async function getEntry(
	db: IDBDatabase,
	key: string
): Promise<ShimEntry | undefined> {
	const tx = db.transaction(STORE, 'readonly');
	return promisify<ShimEntry | undefined>(tx.objectStore(STORE).get(key));
}

async function putEntry(
	db: IDBDatabase,
	key: string,
	entry: ShimEntry
): Promise<void> {
	const tx = db.transaction(STORE, 'readwrite');
	tx.objectStore(STORE).put(entry, key);
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () =>
			reject(tx.error ?? new Error('shim: put failed'));
	});
}

async function deleteRange(db: IDBDatabase, prefix: string): Promise<void> {
	const tx = db.transaction(STORE, 'readwrite');
	const store = tx.objectStore(STORE);
	const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
	store.delete(range);
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () =>
			reject(tx.error ?? new Error('shim: deleteRange failed'));
	});
}

interface ShimDirectoryHandle {
	kind: 'directory';
	name: string;
	getFileHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<ShimFileHandle>;
	getDirectoryHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<ShimDirectoryHandle>;
	removeEntry(
		name: string,
		options?: { recursive?: boolean }
	): Promise<void>;
}

interface ShimFileHandle {
	kind: 'file';
	name: string;
	getFile(): Promise<{ text(): Promise<string>; size: number }>;
	createWritable(): Promise<ShimWritable>;
}

interface ShimWritable {
	write(content: string | Blob | ArrayBuffer): Promise<void>;
	close(): Promise<void>;
	abort(): Promise<void>;
}

function createDirectoryHandle(
	db: IDBDatabase,
	path: string,
	name: string
): ShimDirectoryHandle {
	return {
		kind: 'directory',
		name,
		async getFileHandle(fileName, options) {
			const key = joinKey(path, fileName);
			const existing = await getEntry(db, key);
			if (!existing) {
				if (!options?.create) {
					const error = new Error(
						`NotFoundError: ${fileName}`
					) as Error & { name: string };
					error.name = 'NotFoundError';
					throw error;
				}
				await putEntry(db, key, { kind: 'file', content: '' });
			}
			return createFileHandle(db, key, fileName);
		},
		async getDirectoryHandle(dirName, options) {
			const key = joinKey(path, dirName);
			const existing = await getEntry(db, key);
			if (!existing) {
				if (!options?.create) {
					const error = new Error(
						`NotFoundError: ${dirName}`
					) as Error & { name: string };
					error.name = 'NotFoundError';
					throw error;
				}
				await putEntry(db, key, { kind: 'dir' });
			}
			return createDirectoryHandle(db, key, dirName);
		},
		async removeEntry(childName, options) {
			const key = joinKey(path, childName);
			if (options?.recursive) {
				await deleteRange(db, key);
			} else {
				const tx = db.transaction(STORE, 'readwrite');
				tx.objectStore(STORE).delete(key);
				await new Promise<void>((resolve, reject) => {
					tx.oncomplete = () => resolve();
					tx.onerror = () =>
						reject(tx.error ?? new Error('shim: remove failed'));
				});
			}
		}
	};
}

function createFileHandle(
	db: IDBDatabase,
	key: string,
	name: string
): ShimFileHandle {
	return {
		kind: 'file',
		name,
		async getFile() {
			const entry = await getEntry(db, key);
			if (!entry || entry.kind !== 'file') {
				const error = new Error(
					`NotFoundError: ${name}`
				) as Error & { name: string };
				error.name = 'NotFoundError';
				throw error;
			}
			return {
				size: entry.content.length,
				text: async () => entry.content
			};
		},
		async createWritable() {
			let buffer = '';
			let closed = false;
			return {
				async write(content) {
					if (typeof content === 'string') {
						buffer += content;
					} else if (content instanceof Blob) {
						buffer += await content.text();
					} else if (content instanceof ArrayBuffer) {
						buffer += new TextDecoder().decode(content);
					}
				},
				async close() {
					if (closed) return;
					closed = true;
					await putEntry(db, key, { kind: 'file', content: buffer });
				},
				async abort() {
					closed = true;
				}
			};
		}
	};
}

export class IdbShimProfileStorage implements ProfileStorage {
	readonly kind: ProfileStorageBackendKind = 'idb-shim';
	private readonly profileRoots = new Map<string, Promise<StorageRoot>>();
	private readonly originRoots = new Map<string, Promise<StorageRoot>>();
	private appRoot: Promise<StorageRoot> | undefined;
	private db: Promise<IDBDatabase> | undefined;

	private getDb(): Promise<IDBDatabase> {
		this.db ??= openDb();
		return this.db;
	}

	private async makeRoot(
		path: string,
		profileId: string,
		originScope?: string
	): Promise<StorageRoot> {
		const db = await this.getDb();
		const existing = await getEntry(db, path);
		if (!existing) await putEntry(db, path, { kind: 'dir' });
		const handle = createDirectoryHandle(db, path, path);
		return {
			kind: 'idb-shim',
			profileId,
			originScope,
			caches: undefined,
			indexedDB: undefined,
			getDirectory: async () =>
				handle as unknown as FileSystemDirectoryHandle
		};
	}

	getAppRoot(): Promise<StorageRoot> {
		this.appRoot ??= this.makeRoot('/app', '__app__');
		return this.appRoot;
	}

	getProfileRoot(profileId: string): Promise<StorageRoot> {
		let pending = this.profileRoots.get(profileId);
		if (!pending) {
			pending = this.makeRoot(`/profiles/${profileId}`, profileId);
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
			const safeOrigin = encodeURIComponent(targetOrigin);
			pending = this.makeRoot(
				`/profiles/${profileId}/sites/${safeOrigin}`,
				profileId,
				targetOrigin
			);
			this.originRoots.set(key, pending);
		}
		return pending;
	}

	async destroyProfile(profileId: string): Promise<void> {
		const db = await this.getDb();
		this.profileRoots.delete(profileId);
		for (const key of Array.from(this.originRoots.keys())) {
			if (key.startsWith(`${profileId}\0`)) {
				this.originRoots.delete(key);
			}
		}
		await deleteRange(db, `/profiles/${profileId}`);
	}

	async listPhysicalProfiles(): Promise<string[]> {
		return [];
	}
}
