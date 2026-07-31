import type { SettingsStorage } from '../settings';
import { MainThreadStorage } from './mainThreadStorage';
import {
	StorageWorkerClient,
	StorageWorkerDispatchError,
	StorageWorkerTransportError,
	type StorageMessagePort
} from './storageWorkerClient';

export interface SharedStorageWorker {
	port: StorageMessagePort;
	addEventListener(
		type: 'error',
		listener: (event: ErrorEvent) => void
	): void;
}

export type SharedWorkerFactory = () => SharedStorageWorker;

type MutationOperation = 'setItem' | 'mergeItem' | 'removeItem' | 'clear';

export class StorageMutationOutcomeUnknownError extends Error {
	constructor(operation: MutationOperation, options?: ErrorOptions) {
		super(
			`${operation} may have completed in the storage worker; the mutation was not replayed`,
			options
		);
		this.name = 'StorageMutationOutcomeUnknownError';
	}
}

const defaultSharedWorkerFactory: SharedWorkerFactory = () =>
	new SharedWorker(new URL('./storage.shared-worker.ts', import.meta.url), {
		type: 'module',
		name: 'daydream-storage'
	}) as unknown as SharedStorageWorker;

export class ResilientStorage implements SettingsStorage {
	private clientPromise: Promise<StorageWorkerClient> | undefined;
	private client: StorageWorkerClient | undefined;
	private sharedWorker: SharedStorageWorker | undefined;
	private fallbackOnly = false;
	private warned = false;

	constructor(
		private readonly sharedWorkerFactory: SharedWorkerFactory = defaultSharedWorkerFactory,
		private readonly fallback: SettingsStorage = new MainThreadStorage(),
		private readonly timeoutMs = 5000
	) {}

	getItem<T>(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<T | null> {
		return this.runRead(
			client => client.getItem<T>(filePath, folderPath, key),
			() => this.fallback.getItem<T>(filePath, folderPath, key)
		);
	}

	setItem<T>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T> {
		return this.runMutation(
			'setItem',
			client => client.setItem(filePath, folderPath, key, value),
			() => this.fallback.setItem(filePath, folderPath, key, value)
		);
	}

	mergeItem<T extends Record<string, unknown>>(
		filePath: string,
		folderPath: string,
		key: string,
		value: T
	): Promise<T> {
		return this.runMutation(
			'mergeItem',
			client => client.mergeItem(filePath, folderPath, key, value),
			() => this.fallback.mergeItem(filePath, folderPath, key, value)
		);
	}

	removeItem(
		filePath: string,
		folderPath: string,
		key: string
	): Promise<void> {
		return this.runMutation(
			'removeItem',
			client => client.removeItem(filePath, folderPath, key),
			() => this.fallback.removeItem(filePath, folderPath, key)
		);
	}

	clear(filePath: string, folderPath: string): Promise<void> {
		return this.runMutation(
			'clear',
			client => client.clear(filePath, folderPath),
			() => this.fallback.clear(filePath, folderPath)
		);
	}

	keys(filePath: string, folderPath: string): Promise<string[]> {
		return this.runRead(
			client => client.keys(filePath, folderPath),
			() => this.fallback.keys(filePath, folderPath)
		);
	}

	private async runRead<T>(
		workerOperation: (client: StorageWorkerClient) => Promise<T>,
		fallbackOperation: () => Promise<T>
	): Promise<T> {
		if (this.fallbackOnly) return fallbackOperation();

		let client: StorageWorkerClient;
		try {
			client = await this.getHealthyClient();
		} catch (error) {
			return this.useFallback(error, fallbackOperation);
		}

		try {
			return await workerOperation(client);
		} catch (error) {
			if (error instanceof StorageWorkerDispatchError) {
				return this.useFallback(error, fallbackOperation);
			}
			if (!(error instanceof StorageWorkerTransportError)) throw error;
			return this.useFallback(error, fallbackOperation);
		}
	}

	private async runMutation<T>(
		operation: MutationOperation,
		workerOperation: (client: StorageWorkerClient) => Promise<T>,
		fallbackOperation: () => Promise<T>
	): Promise<T> {
		if (this.fallbackOnly) return fallbackOperation();

		let client: StorageWorkerClient;
		try {
			client = await this.getHealthyClient();
		} catch (error) {
			return this.useFallback(error, fallbackOperation);
		}

		try {
			return await workerOperation(client);
		} catch (error) {
			if (error instanceof StorageWorkerDispatchError) {
				return this.useFallback(error, fallbackOperation);
			}
			if (!(error instanceof StorageWorkerTransportError)) throw error;
			this.activateFallback(error);
			throw new StorageMutationOutcomeUnknownError(operation, {
				cause: error
			});
		}
	}

	private getHealthyClient(): Promise<StorageWorkerClient> {
		if (!this.clientPromise) {
			this.clientPromise = Promise.resolve().then(async () => {
				const sharedWorker = this.sharedWorkerFactory();
				let client: StorageWorkerClient;
				try {
					client = new StorageWorkerClient(
						sharedWorker.port,
						this.timeoutMs
					);
				} catch (error) {
					try {
						sharedWorker.port.close?.();
					} catch {
						// ignore
					}
					throw error;
				}
				this.sharedWorker = sharedWorker;
				this.client = client;
				this.sharedWorker.addEventListener('error', event => {
					const error = new StorageWorkerTransportError(
						event.message || 'Shared storage worker failed'
					);
					client.failTransport(error);
					this.activateFallback(error);
				});
				const health = await client.health();
				if (health !== 'ready') {
					throw new StorageWorkerTransportError(
						`Storage worker returned invalid health response: ${String(health)}`
					);
				}
				return client;
			});
		}
		return this.clientPromise;
	}

	private useFallback<T>(
		error: unknown,
		operation: () => Promise<T>
	): Promise<T> {
		this.activateFallback(error);
		return operation();
	}

	private activateFallback(error: unknown): void {
		if (this.fallbackOnly) return;
		this.fallbackOnly = true;
		const client = this.client;
		this.client = undefined;
		this.sharedWorker = undefined;
		this.clientPromise = undefined;
		try {
			client?.close();
		} catch {
			// ignore
		}
		if (!this.warned) {
			this.warned = true;
			console.warn(
				'Shared storage worker unavailable; using main-thread storage',
				error
			);
		}
	}
}
