import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	StorageWorkerRequest,
	StorageWorkerResponse
} from './storageWorkerProtocol';

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	profileRootError: undefined as Error | undefined,
	serviceInstances: 0
}));

vi.mock('./profileStorage', () => ({
	createProfileStorage: () =>
		Promise.resolve({
			kind: 'idb-shim',
			getProfileRoot: async (profileId: string) => {
				if (mocks.profileRootError) throw mocks.profileRootError;
				return {
					kind: 'idb-shim',
					profileId,
					caches: undefined,
					indexedDB: undefined,
					getDirectory: async () => ({}) as FileSystemDirectoryHandle
				};
			},
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
		constructor() {
			mocks.serviceInstances += 1;
		}

		execute(request: StorageWorkerRequest): Promise<unknown> {
			return mocks.execute(request);
		}
	},
	createDirectoryFileSystem: () => ({})
}));

class TestPort {
	readonly start = vi.fn();
	readonly postMessage = vi.fn<(response: StorageWorkerResponse) => void>();
	private messageListener?: (
		event: MessageEvent<StorageWorkerRequest>
	) => void;

	addEventListener(
		_type: 'message',
		listener: (event: MessageEvent<StorageWorkerRequest>) => void
	): void {
		this.messageListener = listener;
	}

	dispatch(request: StorageWorkerRequest): void {
		this.messageListener?.({
			data: request
		} as MessageEvent<StorageWorkerRequest>);
	}
}

describe('storage shared worker', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
		vi.clearAllMocks();
		mocks.profileRootError = undefined;
		mocks.serviceInstances = 0;
	});

	it('routes port messages through per-profile services', async () => {
		let connectListener:
			((event: { ports: TestPort[] }) => void) | undefined;
		vi.stubGlobal('self', {
			addEventListener: vi.fn(
				(
					type: string,
					listener: (event: { ports: TestPort[] }) => void
				) => {
					if (type === 'connect') connectListener = listener;
				}
			)
		});
		mocks.execute.mockImplementation((request: StorageWorkerRequest) =>
			request.operation === 'clear'
				? Promise.reject(new Error('write failed'))
				: Promise.resolve('ready')
		);

		await import('./storage.shared-worker');

		const firstPort = new TestPort();
		const secondPort = new TestPort();
		connectListener?.({ ports: [firstPort] });
		connectListener?.({ ports: [secondPort] });
		expect(firstPort.start).toHaveBeenCalledOnce();
		expect(secondPort.start).toHaveBeenCalledOnce();

		firstPort.dispatch({
			id: 1,
			profileId: '__default__',
			operation: 'health',
			filePath: '',
			folderPath: ''
		});
		secondPort.dispatch({
			id: 2,
			profileId: '__default__',
			operation: 'clear',
			filePath: '/data/settings.json',
			folderPath: '/data'
		});

		await vi.waitFor(() => {
			expect(firstPort.postMessage).toHaveBeenCalledWith({
				id: 1,
				ok: true,
				value: 'ready'
			});
			expect(secondPort.postMessage).toHaveBeenCalledWith({
				id: 2,
				ok: false,
				error: 'write failed',
				errorKind: 'service'
			});
		});
		expect(mocks.execute).toHaveBeenCalledTimes(2);
		expect(mocks.serviceInstances).toBe(1);
	});

	it('creates independent services per profile id', async () => {
		let connectListener:
			((event: { ports: TestPort[] }) => void) | undefined;
		vi.stubGlobal('self', {
			addEventListener: vi.fn(
				(
					type: string,
					listener: (event: { ports: TestPort[] }) => void
				) => {
					if (type === 'connect') connectListener = listener;
				}
			)
		});
		mocks.execute.mockResolvedValue('ready');

		await import('./storage.shared-worker');

		const port = new TestPort();
		connectListener?.({ ports: [port] });

		port.dispatch({
			id: 1,
			profileId: 'alice',
			operation: 'health',
			filePath: '',
			folderPath: ''
		});
		port.dispatch({
			id: 2,
			profileId: 'bob',
			operation: 'health',
			filePath: '',
			folderPath: ''
		});

		await vi.waitFor(() => {
			expect(mocks.execute).toHaveBeenCalledTimes(2);
		});
		expect(mocks.serviceInstances).toBe(2);
	});
});
