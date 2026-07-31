import type {
	StorageOperation,
	StorageWorkerRequest,
	StorageWorkerResponse
} from './storageWorkerProtocol';
import { DEFAULT_PROFILE_ID } from './storageWorkerProtocol';

export interface StorageMessagePort {
	postMessage(request: StorageWorkerRequest): void;
	start?(): void;
	close?(): void;
	addEventListener(
		type: 'message',
		listener: (event: MessageEvent<StorageWorkerResponse>) => void
	): void;
	addEventListener(
		type: 'messageerror',
		listener: (event: MessageEvent) => void
	): void;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

export class StorageWorkerTransportError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'StorageWorkerTransportError';
	}
}

export class StorageWorkerDispatchError extends StorageWorkerTransportError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'StorageWorkerDispatchError';
	}
}

export class StorageWorkerServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'StorageWorkerServiceError';
	}
}

export class StorageWorkerClient {
	private nextId = 1;
	private readonly pending = new Map<number, PendingRequest>();
	private terminalError: StorageWorkerTransportError | undefined;
	private readonly profileId: string;

	constructor(
		private readonly worker: StorageMessagePort,
		private readonly timeoutMs = 5000,
		profileId: string = DEFAULT_PROFILE_ID
	) {
		this.profileId = profileId;
		worker.addEventListener('message', event => {
			const response = event.data;
			const request = this.pending.get(response.id);
			if (!request) return;

			this.pending.delete(response.id);
			clearTimeout(request.timeout);
			if (response.ok) {
				request.resolve(response.value);
			} else {
				request.reject(
					response.errorKind === 'transport'
						? new StorageWorkerTransportError(response.error)
						: new StorageWorkerServiceError(response.error)
				);
			}
		});
		worker.addEventListener('messageerror', () => {
			this.fail(
				new StorageWorkerTransportError('Storage worker message error')
			);
		});
		worker.start?.();
	}

	health(): Promise<'ready'> {
		return this.request('health', '', '');
	}

	failTransport(error: Error): void {
		this.fail(
			error instanceof StorageWorkerTransportError
				? error
				: new StorageWorkerTransportError(error.message, {
						cause: error
					})
		);
	}

	close(): void {
		try {
			this.worker.close?.();
		} catch {
			// ignore
		}
		this.fail(
			new StorageWorkerTransportError('Storage worker port closed')
		);
	}

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
		return this.request('keys', filePath, folderPath);
	}

	private request<T>(
		operation: StorageOperation,
		filePath: string,
		folderPath: string,
		key?: string,
		value?: unknown
	): Promise<T> {
		if (this.terminalError) {
			return Promise.reject(
				new StorageWorkerDispatchError(this.terminalError.message, {
					cause: this.terminalError
				})
			);
		}
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!this.pending.delete(id)) return;
				reject(
					new StorageWorkerTransportError(
						`Storage worker timed out after ${this.timeoutMs}ms`
					)
				);
			}, this.timeoutMs);
			this.pending.set(id, {
				resolve: result => resolve(result as T),
				reject,
				timeout
			});
			try {
				this.worker.postMessage({
					id,
					profileId: this.profileId,
					operation,
					filePath,
					folderPath,
					...(key === undefined ? {} : { key }),
					...(operation === 'setItem' || operation === 'mergeItem'
						? { value }
						: {})
				});
			} catch (error) {
				this.pending.delete(id);
				clearTimeout(timeout);
				reject(
					new StorageWorkerDispatchError(
						error instanceof Error ? error.message : String(error),
						{ cause: error }
					)
				);
			}
		});
	}

	private fail(error: StorageWorkerTransportError): void {
		if (this.terminalError) return;
		this.terminalError = error;
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(error);
		}
		this.pending.clear();
	}
}
