import { ResilientStorage } from './data/resilientStorage';

export interface SettingsStorage {
	getItem<T>(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<T | null>;
	setItem<T>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T>;
	mergeItem<T extends Record<string, unknown>>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T>;
	removeItem(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<void>;
	clear(filePath: string, folderPath: string): Promise<void>;
	keys(filePath: string, folderPath: string): Promise<string[]>;
}

let resilientStorage: ResilientStorage | undefined;

function getResilientStorage(): ResilientStorage {
	resilientStorage ??= new ResilientStorage();
	return resilientStorage;
}

const sharedStorage: SettingsStorage = {
	getItem: (...args) => getResilientStorage().getItem(...args),
	setItem: (...args) => getResilientStorage().setItem(...args),
	mergeItem: (...args) => getResilientStorage().mergeItem(...args),
	removeItem: (...args) => getResilientStorage().removeItem(...args),
	clear: (...args) => getResilientStorage().clear(...args),
	keys: (...args) => getResilientStorage().keys(...args)
};

export interface SettingsAPIOptions {
	file?: string;
	folder?: string;
	storage?: SettingsStorage;
	/**
	 * Optional profile scope. Reserved for v3 profile routing; currently unused
	 * by the shared storage facade but recorded so callers can begin passing it.
	 */
	profileId?: string;
}

class SettingsAPI {
	readonly storedFilePath: string;
	readonly storedFolderPath: string;
	readonly profileId: string | undefined;
	private readonly storage: SettingsStorage;

	constructor(
		file2Store: string | SettingsAPIOptions = '/data/settings.json',
		folder2Store: string = '/data',
		storage: SettingsStorage = sharedStorage,
		profileId?: string
	) {
		if (typeof file2Store === 'object' && file2Store !== null) {
			const opts = file2Store;
			this.storedFilePath = opts.file ?? '/data/settings.json';
			this.storedFolderPath = opts.folder ?? '/data';
			this.storage = opts.storage ?? sharedStorage;
			this.profileId = opts.profileId;
		} else {
			this.storedFilePath = file2Store;
			this.storedFolderPath = folder2Store;
			this.storage = storage;
			this.profileId = profileId;
		}
	}

	async getItem<T = any>(key: string): Promise<T | null> {
		return this.storage.getItem<T>(
			this.storedFilePath,
			this.storedFolderPath,
			key
		);
	}

	async setItem(key: string, value: any): Promise<any> {
		return this.storage.setItem(
			this.storedFilePath,
			this.storedFolderPath,
			key,
			value
		);
	}

	async mergeItem<T extends Record<string, unknown>>(
		key: string,
		value: T
	): Promise<T> {
		return this.storage.mergeItem(
			this.storedFilePath,
			this.storedFolderPath,
			key,
			value
		);
	}

	async removeItem(key: string): Promise<void> {
		await this.storage.removeItem(
			this.storedFilePath,
			this.storedFolderPath,
			key
		);
	}

	async clearAllSettings(): Promise<void> {
		await this.storage.clear(this.storedFilePath, this.storedFolderPath);
	}

	async clear(): Promise<void> {
		await this.clearAllSettings();
	}

	async keys(): Promise<string[]> {
		return this.storage.keys(this.storedFilePath, this.storedFolderPath);
	}
}

export { SettingsAPI };
