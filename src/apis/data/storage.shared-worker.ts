import { createProfileStorage } from './profileStorage';
import {
	DEFAULT_PROFILE_ID,
	type StorageWorkerRequest,
	type StorageWorkerResponse
} from './storageWorkerProtocol';
import {
	createDirectoryFileSystem,
	StorageWorkerService
} from './storageWorkerService';

const services = new Map<string, StorageWorkerService>();
const storagePromise = createProfileStorage();

function serviceFor(profileId: string): StorageWorkerService {
	let svc = services.get(profileId);
	if (!svc) {
		const fileSystem = storagePromise.then(async storage => {
			const root = await storage.getProfileRoot(profileId);
			return createDirectoryFileSystem(root.getDirectory());
		});
		void fileSystem.catch(() => undefined);
		svc = new StorageWorkerService(fileSystem, null, profileId);
		services.set(profileId, svc);
	}
	return svc;
}

/**
 * Transport-class DOMException names. These indicate the storage substrate
 * itself is momentarily or permanently unable to service the request:
 * concurrent-writable contention, quota exhaustion, revoked handles, aborted
 * streams, or explicit user/system denial. ResilientStorage treats these as
 * transport failures and falls back to main-thread storage.
 *
 * Everything else (bad input, JSON parse failure, reserved keys, etc.) is a
 * service error and propagates to the caller unchanged.
 */
const TRANSPORT_ERROR_NAMES = new Set([
	'NoModificationAllowedError',
	'NotAllowedError',
	'QuotaExceededError',
	'InvalidStateError',
	'AbortError',
	'SecurityError',
	'NotReadableError',
	'InvalidModificationError'
]);

function classifyError(error: unknown): {
	message: string;
	kind: 'transport' | 'service';
} {
	const message =
		error instanceof Error ? error.message : String(error);
	const name = (error as { name?: string } | null | undefined)?.name;
	if (name && TRANSPORT_ERROR_NAMES.has(name)) {
		return { message, kind: 'transport' };
	}
	if (
		/\bstorage\b|\bfilesystem\b|\bopfs\b|\bbucket\b|opendb|unsafe for access|too many calls/i.test(
			message
		)
	) {
		return { message, kind: 'transport' };
	}
	return { message, kind: 'service' };
}

const workerScope = self as unknown as {
	addEventListener(
		type: 'connect',
		listener: (event: MessageEvent) => void
	): void;
};

workerScope.addEventListener('connect', event => {
	for (const port of event.ports) {
		port.addEventListener(
			'message',
			(message: MessageEvent<StorageWorkerRequest>) => {
				const request = message.data;
				const profileId = request.profileId ?? DEFAULT_PROFILE_ID;
				void (async () => {
					try {
						const service = serviceFor(profileId);
						const value = await service.execute(request);
						port.postMessage({
							id: request.id,
							ok: true,
							value
						} satisfies StorageWorkerResponse);
					} catch (error) {
						const { message, kind } = classifyError(error);
						port.postMessage({
							id: request.id,
							ok: false,
							error: message,
							errorKind: kind
						} satisfies StorageWorkerResponse);
					}
				})();
			}
		);
		port.start();
	}
});
