import {
	DEFAULT_PROFILE_ID,
	isReservedKey,
	type StorageWorkerRequest
} from './storageWorkerProtocol';

export interface StorageFileSystem {
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
}

export interface StorageLockManager {
	request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function getStorageLockManager(): StorageLockManager {
	if (typeof navigator === 'undefined' || !navigator.locks) {
		throw new Error('Web Locks API is required for storage');
	}
	return {
		request: (name, callback) =>
			new Promise((resolve, reject) => {
				void navigator.locks
					.request(name, async () => {
						try {
							resolve(await callback());
						} catch (error) {
							reject(error);
						}
					})
					.catch(reject);
			})
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeValue(value: unknown): unknown {
	if (value === undefined) return undefined;
	try {
		const serialized = JSON.stringify(value);
		if (serialized === undefined) return undefined;
		return JSON.parse(serialized);
	} catch {
		return undefined;
	}
}

export class StorageWorkerService {
	private queue = Promise.resolve();
	private readonly initializedFiles = new Set<string>();
	private readonly profileId: string;

	constructor(
		private readonly fileSystem: Promise<StorageFileSystem>,
		private readonly locks: StorageLockManager | null = getStorageLockManager(),
		profileId: string = DEFAULT_PROFILE_ID
	) {
		this.profileId = profileId;
	}

	execute(request: StorageWorkerRequest): Promise<unknown> {
		if (request.operation === 'health') return Promise.resolve('ready');

		const execute = async () => {
			const fs = await this.fileSystem;
			await this.ensureFile(fs, request.folderPath, request.filePath);
			return this.executeNow(fs, request);
		};
		const result = this.queue.then(() =>
			this.locks
				? this.locks.request(
						`daydream-storage:${this.profileId}:${request.filePath}`,
						execute
					)
				: execute()
		);
		this.queue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async executeNow(
		fs: StorageFileSystem,
		request: StorageWorkerRequest
	): Promise<unknown> {
		if (request.operation === 'clear') {
			await this.writeData(fs, request.filePath, Object.create(null));
			return undefined;
		}

		const data = await this.readData(fs, request.filePath);
		if (request.operation === 'keys') return Object.keys(data);

		const key = request.key;
		if (key === undefined)
			throw new Error(`${request.operation} requires a key`);
		if (isReservedKey(key))
			throw new Error(
				`Storage key '${key}' is reserved and cannot be used`
			);

		if (request.operation === 'getItem') {
			return Object.prototype.hasOwnProperty.call(data, key)
				? (data[key] as unknown)
				: null;
		}
		if (request.operation === 'mergeItem') {
			const current = Object.prototype.hasOwnProperty.call(data, key)
				? data[key]
				: undefined;
			const patch = request.value;
			if (!isRecord(patch))
				throw new Error('mergeItem requires an object value');
			const base = isRecord(current) ? current : {};
			const merged = { ...base, ...patch };
			const normalized = normalizeValue(merged);
			data[key] = normalized;
			await this.writeData(fs, request.filePath, data);
			return normalized;
		}
		if (request.operation === 'setItem') {
			const normalized = normalizeValue(request.value);
			data[key] = normalized;
			await this.writeData(fs, request.filePath, data);
			return normalized;
		}

		if (Object.prototype.hasOwnProperty.call(data, key)) delete data[key];
		await this.writeData(fs, request.filePath, data);
		return undefined;
	}

	private async ensureFile(
		fs: StorageFileSystem,
		folderPath: string,
		filePath: string
	): Promise<void> {
		if (this.initializedFiles.has(filePath)) return;

		const ensureFolder = async () => {
			if (folderPath && !(await fs.exists(folderPath))) {
				await fs.mkdir(folderPath);
			}
		};
		if (this.locks) {
			await this.locks.request(
				`daydream-storage-folder:${this.profileId}:${folderPath}`,
				ensureFolder
			);
		} else {
			await ensureFolder();
		}

		if (!(await fs.exists(filePath))) {
			await this.writeData(fs, filePath, Object.create(null));
		}
		this.initializedFiles.add(filePath);
	}

	private async readData(
		fs: StorageFileSystem,
		filePath: string
	): Promise<Record<string, unknown>> {
		let content: string;
		try {
			content = await fs.readFile(filePath);
		} catch {
			content = '{}';
		}
		try {
			const parsed: unknown = JSON.parse(content || '{}');
			if (isRecord(parsed)) {
				const clean = Object.create(null) as Record<string, unknown>;
				for (const k of Object.keys(parsed)) {
					if (isReservedKey(k)) continue;
					clean[k] = (parsed as Record<string, unknown>)[k];
				}
				return clean;
			}
		} catch {
			// Reset interrupted or malformed writes below.
		}

		await this.writeData(fs, filePath, Object.create(null));
		return Object.create(null);
	}

	private async writeData(
		fs: StorageFileSystem,
		filePath: string,
		data: Record<string, unknown>
	): Promise<void> {
		const plain: Record<string, unknown> = {};
		for (const key of Object.keys(data)) {
			if (isReservedKey(key)) continue;
			plain[key] = data[key];
		}
		await fs.writeFile(filePath, JSON.stringify(plain));
	}
}

export function createDirectoryFileSystem(
	root: Promise<FileSystemDirectoryHandle>
): StorageFileSystem {
	const normalize = (path: string): string[] =>
		path.split('/').filter(Boolean);

	const resolveDirectory = async (
		segments: string[],
		create: boolean
	): Promise<FileSystemDirectoryHandle> => {
		let handle = await root;
		for (const segment of segments) {
			handle = await handle.getDirectoryHandle(segment, { create });
		}
		return handle;
	};

	const domName = (error: unknown): string =>
		(error as DOMException | undefined)?.name ?? '';
	const isNotFound = (error: unknown): boolean =>
		domName(error) === 'NotFoundError';
	// TypeMismatchError is what OPFS throws when you ask for a file handle on a
	// path that exists but is actually a directory (and vice versa). For an
	// `exists` probe, that's a positive signal — the entry is present, just of
	// the other kind. Callers only care about presence, so we treat it the same
	// as a successful lookup.
	const isWrongKind = (error: unknown): boolean =>
		domName(error) === 'TypeMismatchError';

	return {
		async exists(path: string) {
			const segments = normalize(path);
			if (segments.length === 0) return true;
			const parent = segments.slice(0, -1);
			const last = segments[segments.length - 1]!;
			try {
				const parentHandle = await resolveDirectory(parent, false);
				try {
					await parentHandle.getFileHandle(last);
					return true;
				} catch (error) {
					if (isNotFound(error)) {
						// fall through to directory probe
					} else if (isWrongKind(error)) {
						return true;
					} else {
						throw error;
					}
				}
				try {
					await parentHandle.getDirectoryHandle(last);
					return true;
				} catch (error) {
					if (isNotFound(error)) return false;
					if (isWrongKind(error)) return true;
					throw error;
				}
			} catch (error) {
				if (isNotFound(error)) return false;
				if (isWrongKind(error)) return false;
				throw error;
			}
		},
		async mkdir(path: string) {
			await resolveDirectory(normalize(path), true);
		},
		async readFile(path: string) {
			const segments = normalize(path);
			const parent = await resolveDirectory(segments.slice(0, -1), false);
			const handle = await parent.getFileHandle(
				segments[segments.length - 1]!
			);
			const file = await handle.getFile();
			return file.text();
		},
		async writeFile(path: string, content: string) {
			const segments = normalize(path);
			const parent = await resolveDirectory(segments.slice(0, -1), true);
			const handle = await parent.getFileHandle(
				segments[segments.length - 1]!,
				{ create: true }
			);
			// createWritable() throws NoModificationAllowedError when another
			// writable is still open on the same file. That other writable is
			// almost always a sibling request on the same profile that hasn't
			// finished close()-ing yet (browser file-handle cleanup is async).
			// Retry with exponential backoff before surfacing — waiting a few
			// ms is drastically cheaper than falling back to main-thread
			// storage or failing the caller.
			let writable: FileSystemWritableFileStream | undefined;
			let attempt = 0;
			const maxAttempts = 6;
			while (true) {
				try {
					writable = await handle.createWritable();
					break;
				} catch (error) {
					const name =
						(error as DOMException | undefined)?.name ?? '';
					const retryable =
						name === 'NoModificationAllowedError' ||
						name === 'InvalidStateError';
					if (!retryable || attempt >= maxAttempts) throw error;
					const delay = Math.min(
						2 ** attempt * 8 + Math.floor(Math.random() * 8),
						200
					);
					attempt++;
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
			try {
				await writable.write(content);
				await writable.close();
			} catch (error) {
				try {
					await writable.abort();
				} catch {
					// ignore
				}
				throw error;
			}
		}
	};
}
