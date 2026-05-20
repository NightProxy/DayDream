// Pulsar tunnel: WebSocket-like adapter on top of an RTCDataChannel
// (for use as libcurl.js custom transport), plus the factory the
// `libcurl.transport` setter expects.
//
// Vendored from @abndnce/pulsar-client.

import { SOCKET_PREFIX } from './constants';
import { waitForDataChannelOpen } from './webrtc';

/**
 * WebSocket-compatible wrapper around an RTCDataChannel.
 *
 * libcurl.js compares `readyState` against `WebSocket.OPEN` (numeric 1)
 * and expects static constants (`CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`).
 */
export class DataChannelSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	readonly url: string;
	readonly protocol = '';
	readonly extensions = '';

	binaryType: string = 'arraybuffer';

	onopen: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;

	private _channel: RTCDataChannel | null = null;
	private _closed = false;
	private _closeDispatched = false;
	private _readyState: number = DataChannelSocket.CONNECTING;

	constructor(pc: RTCPeerConnection, destination: string) {
		super();
		this.url = `wss://pulsar-tunnel.local/${destination}`;

		const channel = pc.createDataChannel(`${SOCKET_PREFIX}${destination}`, {
			ordered: true
		});
		channel.binaryType = 'arraybuffer';
		this._channel = channel;

		void this._open(channel, pc);
	}

	private async _open(channel: RTCDataChannel, pc: RTCPeerConnection) {
		try {
			await waitForDataChannelOpen(channel, pc);
		} catch (error) {
			if (!this._closed) {
				console.error(
					`[Pulsar] DataChannelSocket failed to open: ${error instanceof Error ? error.message : String(error)}`
				);
				this._dispatchError();
			}
			this._dispatchClose();
			return;
		}

		if (this._closed) {
			channel.close();
			this._dispatchClose();
			return;
		}

		this._readyState = DataChannelSocket.OPEN;

		channel.onmessage = event => {
			this._dispatch(new MessageEvent('message', { data: event.data }));
		};

		channel.onclose = () => {
			this._readyState = DataChannelSocket.CLOSED;
			this._dispatchClose();
		};

		channel.onerror = () => {
			this._dispatchError();
		};

		this._dispatch(new Event('open'));
	}

	get readyState(): number {
		return this._readyState;
	}

	get bufferedAmount(): number {
		return this._channel?.bufferedAmount ?? 0;
	}

	send(data: string | ArrayBufferLike | ArrayBufferView): void {
		if (this._readyState !== DataChannelSocket.OPEN || !this._channel) {
			throw new Error('DataChannelSocket is not open');
		}
		if (typeof data === 'string') {
			this._channel.send(data);
		} else {
			(this._channel as any).send(data);
		}
	}

	close(): void {
		if (this._closed) return;
		this._closed = true;

		if (this._channel && this._channel.readyState !== 'closed') {
			this._channel.close();
		} else {
			this._dispatchClose();
		}
	}

	private _dispatch(event: Event): void {
		const type = event.type;
		const handlerName = `on${type}` as
			| 'onopen'
			| 'onclose'
			| 'onerror'
			| 'onmessage';
		const handler = this[handlerName];
		if (handler) (handler as (event: Event) => void)(event);
		this.dispatchEvent(event);
	}

	private _dispatchError(): void {
		this._dispatch(new Event('error'));
	}

	private _dispatchClose(): void {
		if (this._closeDispatched) return;
		this._closeDispatched = true;
		this._readyState = DataChannelSocket.CLOSED;
		this._dispatch(new CloseEvent('close'));
	}
}

/**
 * Build a libcurl.js transport factory from an existing peer connection.
 *
 * libcurl.js calls the factory with URLs like:
 *   `wss://pulsar-tunnel.local/example.com:80`
 *
 * The factory parses `<hostname>:<port>` from the URL path, opens a
 * Pulsar socket data channel, and returns a WebSocket-like adapter.
 */
export function libcurlTransport(
	pc: RTCPeerConnection
): (url: string) => DataChannelSocket {
	return function (url: string): DataChannelSocket {
		let dest: string;
		try {
			const parsed = new URL(url);
			dest = parsed.pathname.replace(/^\//, '').replace(/\/$/, '');
		} catch {
			const slash = url.indexOf('/', url.indexOf('//') + 2);
			dest = slash === -1 ? url : url.slice(slash + 1);
		}

		if (!dest) {
			throw new Error(
				`libcurl transport: no destination found in URL "${url}"`
			);
		}

		const sep = dest.lastIndexOf(':');
		if (sep === -1) {
			throw new Error(
				`libcurl transport: invalid destination "${dest}" — expected "hostname:port"`
			);
		}

		return new DataChannelSocket(pc, dest);
	};
}
