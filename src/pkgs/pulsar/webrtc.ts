// WebRTC connection-state helpers used by the Pulsar client.
// Vendored from @abndnce/pulsar core package.

export const CONNECTION_TIMEOUT_MS = 30_000;

type EventLikePeerConnection = {
	connectionState: string;
	addEventListener(type: string, listener: (event: Event) => void): void;
	removeEventListener(type: string, listener: (event: Event) => void): void;
};

export async function waitForPeerConnectionConnected(
	pc: EventLikePeerConnection,
	timeoutMs = CONNECTION_TIMEOUT_MS
): Promise<void> {
	if (pc.connectionState === 'connected') return;
	if (
		pc.connectionState === 'failed' ||
		pc.connectionState === 'disconnected' ||
		pc.connectionState === 'closed'
	) {
		throw new Error(`Connection failed: ${pc.connectionState}`);
	}

	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timeout);
			pc.removeEventListener('connectionstatechange', onStateChange);
		};

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`WebRTC connection timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		const onStateChange = () => {
			if (pc.connectionState === 'connected') {
				cleanup();
				resolve();
			} else if (
				pc.connectionState === 'failed' ||
				pc.connectionState === 'disconnected' ||
				pc.connectionState === 'closed'
			) {
				cleanup();
				reject(new Error(`Connection failed: ${pc.connectionState}`));
			}
		};

		pc.addEventListener('connectionstatechange', onStateChange);
	});
}

export function waitForDataChannelOpen(
	channel: RTCDataChannel,
	pc: RTCPeerConnection,
	timeoutMs = 10_000,
	signal?: AbortSignal
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('The operation was aborted.', 'AbortError'));
			return;
		}

		if (channel.readyState === 'open') {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`DataChannel open timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		const cleanup = () => {
			clearTimeout(timeout);
			channel.removeEventListener('open', onOpen);
			channel.removeEventListener('close', onClose);
			channel.removeEventListener('error', onError);
			pc.removeEventListener('connectionstatechange', onStateChange);
			signal?.removeEventListener('abort', onAbort);
		};

		const onOpen = () => {
			cleanup();
			resolve();
		};

		const onClose = () => {
			cleanup();
			reject(new Error('DataChannel closed before opening'));
		};

		const onError = () => {
			cleanup();
			reject(new Error('DataChannel error before opening'));
		};

		const onStateChange = () => {
			if (
				pc.connectionState === 'failed' ||
				pc.connectionState === 'closed'
			) {
				cleanup();
				reject(new Error(`Peer connection ${pc.connectionState}`));
			}
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('The operation was aborted.', 'AbortError'));
		};

		channel.addEventListener('open', onOpen, { once: true });
		channel.addEventListener('close', onClose, { once: true });
		channel.addEventListener('error', onError, { once: true });
		pc.addEventListener('connectionstatechange', onStateChange);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}
