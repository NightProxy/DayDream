import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageWorkerRequest } from './storageWorkerProtocol';

const mocks = vi.hoisted(() => ({
	serviceInstances: 0,
	requests: [] as StorageWorkerRequest[],
	profileIds: [] as string[]
}));

vi.mock('./profileStorage', () => ({
	createProfileStorage: () =>
		Promise.resolve({
			kind: 'idb-shim',
			getProfileRoot: async (profileId: string) => ({
				kind: 'idb-shim',
				profileId,
				caches: undefined,
				indexedDB: undefined,
				getDirectory: async () => ({}) as FileSystemDirectoryHandle
			}),
			getOriginRoot: async () => {
				throw new Error('unused');
			},
			getAppRoot: async () => {
				throw new Error('unused');
			},
			destroyProfile: async () => undefined,
			listPhysicalProfiles: async () => []
		})
}));

vi.mock('./storageWorkerService', () => ({
	StorageWorkerService: class {
		constructor(
			_fs: unknown,
			_locks: unknown,
			profileId?: string
		) {
			mocks.serviceInstances += 1;
			if (profileId) mocks.profileIds.push(profileId);
		}

		execute(request: StorageWorkerRequest): Promise<unknown> {
			mocks.requests.push(request);
			if (request.operation === 'getItem') return Promise.resolve('dark');
			if (request.operation === 'keys') return Promise.resolve(['theme']);
			return Promise.resolve(request.value);
		}
	},
	createDirectoryFileSystem: () => ({})
}));

import { MainThreadStorage } from './mainThreadStorage';

describe('MainThreadStorage', () => {
	beforeEach(() => {
		mocks.serviceInstances = 0;
		mocks.requests.length = 0;
		mocks.profileIds.length = 0;
	});

	it('lazily creates one service and delegates every operation', async () => {
		const storage = new MainThreadStorage();
		const base = ['/data/settings.json', '/data'] as const;

		expect(mocks.serviceInstances).toBe(0);
		await expect(storage.getItem(...base, 'theme')).resolves.toBe('dark');
		await expect(storage.setItem(...base, 'theme', 'light')).resolves.toBe(
			'light'
		);
		await expect(
			storage.mergeItem(...base, 'profile', { locale: 'en-US' })
		).resolves.toEqual({ locale: 'en-US' });
		await expect(
			storage.removeItem(...base, 'theme')
		).resolves.toBeUndefined();
		await expect(storage.clear(...base)).resolves.toBeUndefined();
		await expect(storage.keys(...base)).resolves.toEqual(['theme']);

		expect(mocks.serviceInstances).toBe(1);
		expect(mocks.requests.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(mocks.requests.map(({ operation }) => operation)).toEqual([
			'getItem',
			'setItem',
			'mergeItem',
			'removeItem',
			'clear',
			'keys'
		]);
		expect(
			mocks.requests.every(r => r.profileId === '__default__')
		).toBe(true);
	});
});
