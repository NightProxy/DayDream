import { describe, expect, it, vi } from 'vitest';
import {
	StorageWorkerDispatchError,
	StorageWorkerServiceError,
	StorageWorkerTransportError,
	StorageWorkerClient,
	type StorageMessagePort
} from './storageWorkerClient';
import type {
	StorageWorkerRequest,
	StorageWorkerResponse
} from './storageWorkerProtocol';

class FakeWorker implements StorageMessagePort {
	readonly requests: StorageWorkerRequest[] = [];
	started = false;
	private listener?: (event: MessageEvent<StorageWorkerResponse>) => void;
	private messageErrorListener?: (event: MessageEvent) => void;
	private postMessageError?: Error;

	start(): void {
		this.started = true;
	}

	addEventListener(
		type: 'message' | 'messageerror',
		listener:
			| ((event: MessageEvent<StorageWorkerResponse>) => void)
			| ((event: MessageEvent) => void)
	): void {
		if (type === 'message') {
			this.listener = listener as (
				event: MessageEvent<StorageWorkerResponse>
			) => void;
		} else {
			this.messageErrorListener = listener as (
				event: MessageEvent
			) => void;
		}
	}

	postMessage(request: StorageWorkerRequest): void {
		if (this.postMessageError) {
			const error = this.postMessageError;
			this.postMessageError = undefined;
			throw error;
		}
		this.requests.push(request);
	}

	throwOnNextPost(error: Error): void {
		this.postMessageError = error;
	}

	respond(response: StorageWorkerResponse): void {
		this.listener?.({
			data: response
		} as MessageEvent<StorageWorkerResponse>);
	}

	failMessage(): void {
		this.messageErrorListener?.({} as MessageEvent);
	}
}

describe('StorageWorkerClient', () => {
	it('starts the port when constructed', () => {
		const worker = new FakeWorker();

		new StorageWorkerClient(worker);

		expect(worker.started).toBe(true);
	});

	it('supports message ports without start', () => {
		const worker: StorageMessagePort = {
			addEventListener: () => {},
			postMessage: () => {}
		};

		expect(() => new StorageWorkerClient(worker)).not.toThrow();
	});

	it('requests worker health and resolves ready', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);

		const health = client.health();

		expect(worker.requests[0]).toMatchObject({ operation: 'health' });
		worker.respond({ id: worker.requests[0].id, ok: true, value: 'ready' });
		await expect(health).resolves.toBe('ready');
	});

	it('matches concurrent responses to their requests', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);

		const first = client.getItem('/data/settings.json', '/data', 'theme');
		const second = client.getItem('/data/settings.json', '/data', 'locale');

		worker.respond({
			id: worker.requests[1].id,
			ok: true,
			value: 'en-US'
		});
		worker.respond({
			id: worker.requests[0].id,
			ok: true,
			value: 'dark'
		});

		await expect(first).resolves.toBe('dark');
		await expect(second).resolves.toBe('en-US');
	});

	it('rejects only the request reported as failed', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);

		const failed = client.keys('/data/settings.json', '/data');
		const successful = client.clear('/data/cache.json', '/data');

		worker.respond({
			id: worker.requests[0].id,
			ok: false,
			error: 'storage unavailable',
			errorKind: 'service'
		});
		worker.respond({ id: worker.requests[1].id, ok: true });

		await expect(failed).rejects.toBeInstanceOf(StorageWorkerServiceError);
		await expect(failed).rejects.toThrow('storage unavailable');
		await expect(successful).resolves.toBeUndefined();
	});

	it('classifies transport error responses as worker unavailability', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);
		const health = client.health();

		worker.respond({
			id: worker.requests[0].id,
			ok: false,
			error: 'NightFS init failed',
			errorKind: 'transport'
		});

		await expect(health).rejects.toBeInstanceOf(
			StorageWorkerTransportError
		);
		await expect(health).rejects.toThrow('NightFS init failed');
	});

	it('preserves an explicit undefined value for setItem', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);

		const result = client.setItem(
			'/data/settings.json',
			'/data',
			'theme',
			undefined
		);

		expect(
			Object.prototype.hasOwnProperty.call(worker.requests[0], 'value')
		).toBe(true);
		expect(worker.requests[0].value).toBeUndefined();
		worker.respond({
			id: worker.requests[0].id,
			ok: true,
			value: undefined
		});
		await expect(result).resolves.toBeUndefined();
	});

	it('rejects every pending request when the worker crashes', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);

		const first = client.keys('/data/settings.json', '/data');
		const second = client.clear('/data/cache.json', '/data');
		client.failTransport(new Error('worker failed to load'));

		await expect(first).rejects.toBeInstanceOf(StorageWorkerTransportError);
		await expect(second).rejects.toBeInstanceOf(
			StorageWorkerTransportError
		);
		await expect(first).rejects.toThrow('worker failed to load');
		await expect(second).rejects.toThrow('worker failed to load');
		await expect(
			client.keys('/data/settings.json', '/data')
		).rejects.toThrow('worker failed to load');
	});

	it('classifies requests started after terminal failure as not dispatched', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);
		const pending = client.clear('/data/cache.json', '/data');
		const pendingError = pending.catch(error => error);

		client.failTransport(new Error('worker failed to load'));

		expect(await pendingError).toBeInstanceOf(StorageWorkerTransportError);
		expect(await pendingError).not.toBeInstanceOf(
			StorageWorkerDispatchError
		);
		await expect(
			client.setItem('/data/settings.json', '/data', 'theme', 'dark')
		).rejects.toBeInstanceOf(StorageWorkerDispatchError);
		expect(worker.requests).toHaveLength(1);
	});

	it('rejects a timed-out request without failing the client', async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker, 25);

			const timedOut = client.keys('/data/settings.json', '/data');
			const timedOutType = expect(timedOut).rejects.toBeInstanceOf(
				StorageWorkerTransportError
			);
			const timedOutAssertion = expect(timedOut).rejects.toThrow(
				'Storage worker timed out'
			);

			await vi.advanceTimersByTimeAsync(25);
			await timedOutType;
			await timedOutAssertion;

			const next = client.clear('/data/cache.json', '/data');
			worker.respond({ id: worker.requests[1].id, ok: true });
			await expect(next).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it('cleans up a request when postMessage throws without failing the client', async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker, 25);
			worker.throwOnNextPost(new Error('failed to send'));
			let rejectionCount = 0;

			const failed = client.keys('/data/settings.json', '/data');
			void failed.catch(() => {
				rejectionCount++;
			});

			await expect(failed).rejects.toBeInstanceOf(
				StorageWorkerDispatchError
			);
			await expect(failed).rejects.toThrow('failed to send');
			expect(rejectionCount).toBe(1);
			expect(vi.getTimerCount()).toBe(0);

			await vi.advanceTimersByTimeAsync(25);
			expect(rejectionCount).toBe(1);
			expect(vi.getTimerCount()).toBe(0);

			const next = client.clear('/data/cache.json', '/data');
			worker.respond({ id: worker.requests[0].id, ok: true });
			await expect(next).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it('uses a 5000ms request timeout by default', async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker);
			const request = client.keys('/data/settings.json', '/data');
			let rejected = false;
			void request.catch(() => {
				rejected = true;
			});

			await vi.advanceTimersByTimeAsync(4999);
			expect(rejected).toBe(false);

			const rejection = expect(request).rejects.toThrow(
				'Storage worker timed out after 5000ms'
			);
			await vi.advanceTimersByTimeAsync(1);
			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps another concurrent request pending after one times out', async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker, 25);
			const timedOut = client.keys('/data/settings.json', '/data');
			const timedOutRejection = expect(timedOut).rejects.toThrow(
				'Storage worker timed out'
			);

			await vi.advanceTimersByTimeAsync(10);
			const pending = client.clear('/data/cache.json', '/data');
			await vi.advanceTimersByTimeAsync(15);
			await timedOutRejection;

			worker.respond({ id: worker.requests[1].id, ok: true });
			await expect(pending).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears timers for success and protocol-error responses', async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker, 25);
			const successful = client.clear('/data/cache.json', '/data');
			const failed = client.keys('/data/settings.json', '/data');

			worker.respond({ id: worker.requests[0].id, ok: true });
			worker.respond({
				id: worker.requests[1].id,
				ok: false,
				error: 'storage unavailable',
				errorKind: 'service'
			});

			await expect(successful).resolves.toBeUndefined();
			await expect(failed).rejects.toThrow('storage unavailable');
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(25);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		{
			name: 'facade error',
			fail: (_worker: FakeWorker, client: StorageWorkerClient) =>
				client.failTransport(new Error('worker failed'))
		},
		{
			name: 'messageerror',
			fail: (worker: FakeWorker) => worker.failMessage()
		}
	])('clears pending timers after terminal $name', async ({ fail }) => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new StorageWorkerClient(worker, 25);
			const first = client.keys('/data/settings.json', '/data');
			const second = client.clear('/data/cache.json', '/data');
			const firstRejection = expect(first).rejects.toThrow();
			const secondRejection = expect(second).rejects.toThrow();

			fail(worker, client);

			await firstRejection;
			await secondRejection;
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(25);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('treats message errors as terminal failures', async () => {
		const worker = new FakeWorker();
		const client = new StorageWorkerClient(worker);
		const first = client.keys('/data/settings.json', '/data');
		const second = client.clear('/data/cache.json', '/data');

		worker.failMessage();

		await expect(first).rejects.toThrow();
		await expect(second).rejects.toThrow();
		await expect(
			client.keys('/data/settings.json', '/data')
		).rejects.toThrow();
	});
});
