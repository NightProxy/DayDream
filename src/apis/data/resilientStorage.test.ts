import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsStorage } from '../settings';
import {
	StorageWorkerServiceError,
	type StorageMessagePort
} from './storageWorkerClient';
import type {
	StorageWorkerRequest,
	StorageWorkerResponse
} from './storageWorkerProtocol';
import {
	ResilientStorage,
	StorageMutationOutcomeUnknownError
} from './resilientStorage';

class TestPort implements StorageMessagePort {
	readonly requests: StorageWorkerRequest[] = [];
	readonly start = vi.fn();
	readonly close = vi.fn();
	onRequest?: (request: StorageWorkerRequest) => void;
	private dispatchErrorOperation?: StorageWorkerRequest['operation'];
	private messageListener?: (
		event: MessageEvent<StorageWorkerResponse>
	) => void;
	private messageErrorListener?: (event: MessageEvent) => void;

	addEventListener(
		type: 'message' | 'messageerror',
		listener:
			| ((event: MessageEvent<StorageWorkerResponse>) => void)
			| ((event: MessageEvent) => void)
	): void {
		if (type === 'message') {
			this.messageListener = listener as (
				event: MessageEvent<StorageWorkerResponse>
			) => void;
		} else {
			this.messageErrorListener = listener as (
				event: MessageEvent
			) => void;
		}
	}

	postMessage(request: StorageWorkerRequest): void {
		if (request.operation === this.dispatchErrorOperation) {
			this.dispatchErrorOperation = undefined;
			throw new Error(`failed to dispatch ${request.operation}`);
		}
		this.requests.push(request);
		this.onRequest?.(request);
	}

	throwOnOperation(operation: StorageWorkerRequest['operation']): void {
		this.dispatchErrorOperation = operation;
	}

	respond(response: StorageWorkerResponse): void {
		this.messageListener?.({
			data: response
		} as MessageEvent<StorageWorkerResponse>);
	}

	failMessage(): void {
		this.messageErrorListener?.({} as MessageEvent);
	}
}

class TestSharedWorker {
	private errorListener?: (event: ErrorEvent) => void;

	constructor(readonly port: TestPort) {}

	addEventListener(
		type: 'error',
		listener: (event: ErrorEvent) => void
	): void {
		if (type === 'error') this.errorListener = listener;
	}

	fail(message: string): void {
		this.errorListener?.({ message } as ErrorEvent);
	}
}

function createFallback(): SettingsStorage & {
	[K in keyof SettingsStorage]: ReturnType<typeof vi.fn>;
} {
	return {
		getItem: vi.fn().mockResolvedValue('fallback'),
		setItem: vi
			.fn()
			.mockImplementation(async (_file, _folder, _key, value) => value),
		mergeItem: vi
			.fn()
			.mockImplementation(async (_file, _folder, _key, value) => value),
		removeItem: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined),
		keys: vi.fn().mockResolvedValue(['fallback-key'])
	};
}

function respondReady(port: TestPort): void {
	port.onRequest = request => {
		if (request.operation === 'health') {
			port.respond({ id: request.id, ok: true, value: 'ready' });
		}
	};
}

function createWorker(port: TestPort): TestSharedWorker {
	return new TestSharedWorker(port);
}

describe('ResilientStorage', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('falls back when SharedWorker is unavailable', async () => {
		vi.stubGlobal('SharedWorker', undefined);
		const fallback = createFallback();
		const storage = new ResilientStorage(undefined, fallback, 25);

		await expect(
			storage.getItem('/data/settings.json', '/data', 'theme')
		).resolves.toBe('fallback');
		expect(fallback.getItem).toHaveBeenCalledOnce();
	});

	it('constructs the SharedWorker lazily and falls back when construction throws', async () => {
		const factory = vi.fn(() => {
			throw new Error('SharedWorker construction failed');
		});
		const fallback = createFallback();
		const storage = new ResilientStorage(factory, fallback, 25);

		expect(factory).not.toHaveBeenCalled();
		await storage.keys('/data/settings.json', '/data');

		expect(factory).toHaveBeenCalledOnce();
		expect(fallback.keys).toHaveBeenCalledOnce();
	});

	it('falls back when the initial health check times out', async () => {
		vi.useFakeTimers();
		const port = new TestPort();
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		const result = storage.getItem('/data/settings.json', '/data', 'theme');
		const assertion = expect(result).resolves.toBe('fallback');
		await vi.advanceTimersByTimeAsync(25);

		await assertion;
		expect(port.requests).toHaveLength(1);
		expect(port.requests[0].operation).toBe('health');
	});

	it.each([
		{
			name: 'protocol response',
			response: (id: number): StorageWorkerResponse => ({
				id,
				ok: true,
				value: 'starting'
			})
		},
		{
			name: 'filesystem initialization',
			response: (id: number): StorageWorkerResponse => ({
				id,
				ok: false,
				error: 'NightFS init failed',
				errorKind: 'transport'
			})
		}
	])('falls back when health fails through a $name', async ({ response }) => {
		const port = new TestPort();
		port.onRequest = request => port.respond(response(request.id));
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		await expect(
			storage.keys('/data/settings.json', '/data')
		).resolves.toEqual(['fallback-key']);
		expect(fallback.keys).toHaveBeenCalledOnce();
	});

	it('executes a mutation once in fallback when health fails before send', async () => {
		const port = new TestPort();
		port.onRequest = request => {
			port.respond({
				id: request.id,
				ok: false,
				error: 'NightFS init failed',
				errorKind: 'transport'
			});
		};
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		await expect(
			storage.setItem('/data/settings.json', '/data', 'theme', 'dark')
		).resolves.toBe('dark');
		expect(port.requests.map(({ operation }) => operation)).toEqual([
			'health'
		]);
		expect(fallback.setItem).toHaveBeenCalledOnce();
	});

	it('retries a real operation once after a port message error', async () => {
		const port = new TestPort();
		respondReady(port);
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		const result = storage.getItem('/data/settings.json', '/data', 'theme');
		await vi.waitFor(() => expect(port.requests).toHaveLength(2));
		port.failMessage();

		await expect(result).resolves.toBe('fallback');
		expect(fallback.getItem).toHaveBeenCalledOnce();
		expect(port.close).toHaveBeenCalledOnce();
	});

	it('listens for errors on the SharedWorker object and closes its port', async () => {
		vi.useFakeTimers();
		const port = new TestPort();
		respondReady(port);
		const worker = createWorker(port);
		const fallback = createFallback();
		const storage = new ResilientStorage(() => worker, fallback, 25);

		const result = storage.getItem('/data/settings.json', '/data', 'theme');
		await vi.waitFor(() => expect(port.requests).toHaveLength(2));
		worker.fail('shared worker script failed');
		await Promise.resolve();

		expect(port.close).toHaveBeenCalledOnce();
		await expect(result).resolves.toBe('fallback');
		expect(fallback.getItem).toHaveBeenCalledOnce();
	});

	it('switches immediately when an idle SharedWorker emits an error', async () => {
		const port = new TestPort();
		port.onRequest = request => {
			port.respond({
				id: request.id,
				ok: true,
				value: request.operation === 'health' ? 'ready' : ['worker-key']
			});
		};
		const worker = createWorker(port);
		const fallback = createFallback();
		const storage = new ResilientStorage(() => worker, fallback, 25);

		await expect(
			storage.keys('/data/settings.json', '/data')
		).resolves.toEqual(['worker-key']);
		worker.fail('idle worker failed');
		await Promise.resolve();

		expect(port.close).toHaveBeenCalledOnce();
		await expect(
			storage.keys('/data/settings.json', '/data')
		).resolves.toEqual(['fallback-key']);
		expect(port.requests).toHaveLength(2);
		expect(fallback.keys).toHaveBeenCalledOnce();
	});

	it('switches permanently after a runtime request timeout and warns only once', async () => {
		vi.useFakeTimers();
		const warn = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined);
		const port = new TestPort();
		respondReady(port);
		const fallback = createFallback();
		const factory = vi.fn(() => createWorker(port));
		const storage = new ResilientStorage(factory, fallback, 25);

		const first = storage.getItem('/data/settings.json', '/data', 'theme');
		await vi.advanceTimersByTimeAsync(25);
		await expect(first).resolves.toBe('fallback');

		await expect(
			storage.keys('/data/settings.json', '/data')
		).resolves.toEqual(['fallback-key']);
		expect(factory).toHaveBeenCalledOnce();
		expect(port.requests.map(({ operation }) => operation)).toEqual([
			'health',
			'getItem'
		]);
		expect(fallback.getItem).toHaveBeenCalledOnce();
		expect(fallback.keys).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledOnce();
		expect(port.close).toHaveBeenCalledOnce();
	});

	it('does not replay a timed-out mutation and sends the next mutation to fallback', async () => {
		vi.useFakeTimers();
		const port = new TestPort();
		respondReady(port);
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		const result = storage.setItem(
			'/data/cache.json',
			'/data',
			'theme',
			'dark'
		);
		const typeAssertion = expect(result).rejects.toBeInstanceOf(
			StorageMutationOutcomeUnknownError
		);
		const messageAssertion = expect(result).rejects.toThrow(
			'setItem may have completed in the storage worker'
		);
		await vi.advanceTimersByTimeAsync(25);

		await typeAssertion;
		await messageAssertion;
		expect(fallback.setItem).not.toHaveBeenCalled();

		await expect(
			storage.setItem('/data/cache.json', '/data', 'theme', 'light')
		).resolves.toBe('light');
		expect(fallback.setItem).toHaveBeenCalledOnce();
		expect(fallback.setItem).toHaveBeenCalledWith(
			'/data/cache.json',
			'/data',
			'theme',
			'light'
		);
	});

	it('executes a mutation once in fallback when dispatch throws before send', async () => {
		const port = new TestPort();
		respondReady(port);
		port.throwOnOperation('setItem');
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		await expect(
			storage.setItem('/data/settings.json', '/data', 'theme', 'dark')
		).resolves.toBe('dark');
		expect(port.requests.map(({ operation }) => operation)).toEqual([
			'health'
		]);
		expect(fallback.setItem).toHaveBeenCalledOnce();
		expect(fallback.setItem).toHaveBeenCalledWith(
			'/data/settings.json',
			'/data',
			'theme',
			'dark'
		);
		expect(port.close).toHaveBeenCalledOnce();
	});

	it('executes a mutation once in fallback when the worker fails after health but before dispatch', async () => {
		const port = new TestPort();
		const worker = createWorker(port);
		port.onRequest = request => {
			if (request.operation === 'health') {
				port.respond({ id: request.id, ok: true, value: 'ready' });
				worker.fail('shared worker failed after health');
			}
		};
		const fallback = createFallback();
		const storage = new ResilientStorage(() => worker, fallback, 25);

		await expect(
			storage.setItem('/data/settings.json', '/data', 'theme', 'dark')
		).resolves.toBe('dark');
		expect(port.requests.map(({ operation }) => operation)).toEqual([
			'health'
		]);
		expect(fallback.setItem).toHaveBeenCalledOnce();
		expect(fallback.setItem).toHaveBeenCalledWith(
			'/data/settings.json',
			'/data',
			'theme',
			'dark'
		);
		expect(port.close).toHaveBeenCalledOnce();
	});

	it('does not replay a mutation interrupted by a SharedWorker object error', async () => {
		const port = new TestPort();
		respondReady(port);
		const worker = createWorker(port);
		const fallback = createFallback();
		const storage = new ResilientStorage(() => worker, fallback, 1000);

		const result = storage.mergeItem(
			'/data/cache.json',
			'/data',
			'session',
			{ tabs: [] }
		);
		await vi.waitFor(() => expect(port.requests).toHaveLength(2));
		const typeAssertion = expect(result).rejects.toBeInstanceOf(
			StorageMutationOutcomeUnknownError
		);
		const messageAssertion = expect(result).rejects.toThrow(
			'mergeItem may have completed in the storage worker'
		);
		worker.fail('shared worker crashed');

		await typeAssertion;
		await messageAssertion;
		expect(fallback.mergeItem).not.toHaveBeenCalled();
		expect(port.close).toHaveBeenCalledOnce();
	});

	it('propagates healthy service errors without falling back', async () => {
		const port = new TestPort();
		port.onRequest = request => {
			port.respond(
				request.operation === 'health'
					? { id: request.id, ok: true, value: 'ready' }
					: {
							id: request.id,
							ok: false,
							error: 'filesystem write failed',
							errorKind: 'service'
						}
			);
		};
		const fallback = createFallback();
		const storage = new ResilientStorage(
			() => createWorker(port),
			fallback,
			25
		);

		const result = storage.setItem(
			'/data/settings.json',
			'/data',
			'theme',
			'dark'
		);

		await expect(result).rejects.toBeInstanceOf(StorageWorkerServiceError);
		await expect(result).rejects.toThrow('filesystem write failed');
		expect(fallback.setItem).not.toHaveBeenCalled();
	});
});
