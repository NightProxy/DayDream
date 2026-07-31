import { describe, expect, it } from 'vitest';
import {
	StorageWorkerService,
	type StorageFileSystem,
	type StorageLockManager
} from './storageWorkerService';

class MemoryFileSystem implements StorageFileSystem {
	readonly directories = new Set<string>();
	readonly files = new Map<string, string>();

	async exists(path: string): Promise<boolean> {
		return this.directories.has(path) || this.files.has(path);
	}

	async mkdir(path: string): Promise<void> {
		this.directories.add(path);
	}

	async readFile(path: string): Promise<string> {
		return this.files.get(path) ?? '{}';
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}
}

class StrictDirectoryFileSystem extends MemoryFileSystem {
	mkdirCalls = 0;

	override async mkdir(path: string): Promise<void> {
		this.mkdirCalls += 1;
		if (this.directories.has(path)) {
			throw new Error(`EEXIST: ${path}`);
		}
		this.directories.add(path);
	}
}

class MemoryLockManager implements StorageLockManager {
	private readonly queues = new Map<string, Promise<void>>();

	async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(name) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>(resolve => {
			release = resolve;
		});
		this.queues.set(
			name,
			previous.then(() => current)
		);
		await previous;
		try {
			return await callback();
		} finally {
			release();
		}
	}
}

describe('StorageWorkerService', () => {
	it('reports ready without touching the filesystem or acquiring a lock', async () => {
		const fileSystem = Promise.reject(
			new Error('filesystem should not be awaited')
		);
		void fileSystem.catch(() => undefined);
		const locks: StorageLockManager = {
			request: async () => {
				throw new Error('lock should not be acquired');
			}
		};
		const service = new StorageWorkerService(fileSystem, locks);

		await expect(
			service.execute({
				id: 0,
				operation: 'health',
				filePath: '',
				folderPath: ''
			})
		).resolves.toBe('ready');
	});

	it('serializes concurrent mutations into a plain user JSON object', async () => {
		const fs = new MemoryFileSystem();
		const service = new StorageWorkerService(Promise.resolve(fs), null);

		await Promise.all([
			service.execute({
				id: 1,
				operation: 'setItem',
				filePath: '/data/settings.json',
				folderPath: '/data',
				key: 'theme',
				value: 'dark'
			}),
			service.execute({
				id: 2,
				operation: 'setItem',
				filePath: '/data/settings.json',
				folderPath: '/data',
				key: 'locale',
				value: 'en-US'
			})
		]);

		expect(JSON.parse(fs.files.get('/data/settings.json')!)).toEqual({
			theme: 'dark',
			locale: 'en-US'
		});
	});

	it('supports reads, removals, keys, and clearing with plain JSON', async () => {
		const fs = new MemoryFileSystem();
		const service = new StorageWorkerService(Promise.resolve(fs), null);
		const base = {
			filePath: '/data/settings.json',
			folderPath: '/data'
		};

		await service.execute({
			id: 1,
			operation: 'setItem',
			...base,
			key: 'theme',
			value: 'dark'
		});
		await expect(
			service.execute({
				id: 2,
				operation: 'getItem',
				...base,
				key: 'theme'
			})
		).resolves.toBe('dark');
		await expect(
			service.execute({ id: 3, operation: 'keys', ...base })
		).resolves.toEqual(['theme']);
		await service.execute({
			id: 4,
			operation: 'removeItem',
			...base,
			key: 'theme'
		});
		await service.execute({ id: 5, operation: 'clear', ...base });

		expect(fs.files.get(base.filePath)).toBe('{}');
	});

	it('atomically merges concurrent updates under the file lock', async () => {
		const fs = new MemoryFileSystem();
		const locks = new MemoryLockManager();
		const firstService = new StorageWorkerService(
			Promise.resolve(fs),
			locks
		);
		const secondService = new StorageWorkerService(
			Promise.resolve(fs),
			locks
		);
		const base = {
			filePath: '/data/cache.json',
			folderPath: '/data',
			key: 'session'
		};

		await Promise.all([
			firstService.execute({
				id: 1,
				operation: 'mergeItem',
				...base,
				value: { tabs: [{ id: 'tab-1' }] }
			}),
			secondService.execute({
				id: 2,
				operation: 'mergeItem',
				...base,
				value: { groups: [{ id: 'group-1' }] }
			})
		]);

		expect(JSON.parse(fs.files.get(base.filePath)!)).toEqual({
			session: {
				tabs: [{ id: 'tab-1' }],
				groups: [{ id: 'group-1' }]
			}
		});
	});

	it('keeps every valid legacy user key untouched', async () => {
		const fs = new MemoryFileSystem();
		const legacyKey = '__daydream_storage_metadata__';
		fs.directories.add('/data');
		fs.files.set(
			'/data/settings.json',
			JSON.stringify({ [legacyKey]: { user: true }, theme: 'dark' })
		);
		const service = new StorageWorkerService(Promise.resolve(fs), null);
		const base = {
			filePath: '/data/settings.json',
			folderPath: '/data'
		};

		await expect(
			service.execute({
				id: 1,
				operation: 'getItem',
				...base,
				key: legacyKey
			})
		).resolves.toEqual({ user: true });
		await expect(
			service.execute({ id: 2, operation: 'keys', ...base })
		).resolves.toEqual([legacyKey, 'theme']);
		await service.execute({
			id: 3,
			operation: 'setItem',
			...base,
			key: 'locale',
			value: 'en-US'
		});

		expect(JSON.parse(fs.files.get(base.filePath)!)).toEqual({
			[legacyKey]: { user: true },
			theme: 'dark',
			locale: 'en-US'
		});
	});

	it('coordinates shared folder creation across services and different files', async () => {
		const fs = new StrictDirectoryFileSystem();
		const locks = new MemoryLockManager();
		const firstService = new StorageWorkerService(
			Promise.resolve(fs),
			locks
		);
		const secondService = new StorageWorkerService(
			Promise.resolve(fs),
			locks
		);

		await Promise.all([
			firstService.execute({
				id: 1,
				operation: 'setItem',
				filePath: '/data/settings.json',
				folderPath: '/data',
				key: 'theme',
				value: 'dark'
			}),
			secondService.execute({
				id: 2,
				operation: 'setItem',
				filePath: '/data/cache.json',
				folderPath: '/data',
				key: 'session',
				value: {}
			})
		]);

		expect(fs.mkdirCalls).toBe(1);
		expect(fs.files.has('/data/settings.json')).toBe(true);
		expect(fs.files.has('/data/cache.json')).toBe(true);
	});

	it('fails fast when cross-context locking is unavailable', () => {
		const fs = new MemoryFileSystem();

		expect(() => new StorageWorkerService(Promise.resolve(fs))).toThrow(
			'Web Locks API is required for storage'
		);
	});

	it('resets malformed settings files before serving reads', async () => {
		const fs = new MemoryFileSystem();
		fs.directories.add('/data');
		fs.files.set('/data/settings.json', '{broken');
		const service = new StorageWorkerService(Promise.resolve(fs), null);

		await expect(
			service.execute({
				id: 1,
				operation: 'getItem',
				filePath: '/data/settings.json',
				folderPath: '/data',
				key: 'theme'
			})
		).resolves.toBeNull();
		expect(fs.files.get('/data/settings.json')).toBe('{}');
	});

	it('rejects reserved prototype-collision keys', async () => {
		const fs = new MemoryFileSystem();
		const service = new StorageWorkerService(Promise.resolve(fs), null);
		const base = {
			filePath: '/data/settings.json',
			folderPath: '/data'
		};

		await expect(
			service.execute({
				id: 1,
				operation: 'setItem',
				...base,
				key: '__proto__',
				value: { polluted: true }
			})
		).rejects.toThrow(/reserved/);

		await expect(
			service.execute({
				id: 2,
				operation: 'getItem',
				...base,
				key: 'constructor'
			})
		).rejects.toThrow(/reserved/);

		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('normalizes non-JSON-safe values before returning', async () => {
		const fs = new MemoryFileSystem();
		const service = new StorageWorkerService(Promise.resolve(fs), null);
		const base = {
			filePath: '/data/settings.json',
			folderPath: '/data'
		};

		const setResult = await service.execute({
			id: 1,
			operation: 'setItem',
			...base,
			key: 'when',
			value: new Date('2026-01-01T00:00:00.000Z')
		});
		expect(setResult).toBe('2026-01-01T00:00:00.000Z');

		const getResult = await service.execute({
			id: 2,
			operation: 'getItem',
			...base,
			key: 'when'
		});
		expect(getResult).toBe('2026-01-01T00:00:00.000Z');
	});
});
