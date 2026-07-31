import type { SettingsStorage } from '../settings';
import { createProfileStorage } from './profileStorage';
import {
	DEFAULT_PROFILE_ID,
	type StorageOperation,
	type StorageWorkerRequest
} from './storageWorkerProtocol';
import {
	createDirectoryFileSystem,
	StorageWorkerService
} from './storageWorkerService';

export class MainThreadStorage implements SettingsStorage {
	private nextId = 1;
	private readonly services = new Map<string, StorageWorkerService>();

	getItem<T>(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<T | null> {
		return this.request<T | null>('getItem', filePath, folderPath, key);
	}

	setItem<T>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T> {
		return this.request<T>('setItem', filePath, folderPath, key, value);
	}

	mergeItem<T extends Record<string, unknown>>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T> {
		return this.request<T>('mergeItem', filePath, folderPath, key, value);
	}

	removeItem(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<void> {
		return this.request('removeItem', filePath, folderPath, key);
	}

	clear(filePath: string, folderPath: string): Promise<void> {
		return this.request('clear', filePath, folderPath);
	}

	keys(filePath: string, folderPath: string): Promise<string[]> {
		return this.request<string[]>('keys', filePath, folderPath);
	}

	private request<T>(
		operation: StorageOperation,
		filePath: string,
		folderPath: string,
		key?: string,
		value?: unknown
	): Promise<T> {
		const profileId = DEFAULT_PROFILE_ID;
		const request: StorageWorkerRequest = {
			id: this.nextId++,
			profileId,
			operation,
			filePath,
			folderPath,
			...(key === undefined ? {} : { key }),
			...(operation === 'setItem' || operation === 'mergeItem'
				? { value }
				: {})
		};
		return this.serviceFor(profileId).execute(request) as Promise<T>;
	}

	private serviceFor(profileId: string): StorageWorkerService {
		let svc = this.services.get(profileId);
		if (!svc) {
			const fileSystem = createProfileStorage().then(async storage => {
				const root = await storage.getProfileRoot(profileId);
				return createDirectoryFileSystem(root.getDirectory());
			});
			void fileSystem.catch(() => undefined);
			svc = new StorageWorkerService(fileSystem, null, profileId);
			this.services.set(profileId, svc);
		}
		return svc;
	}
}
