// Pulsar ProxyTransport client.
//
// Implements the ProxyTransport interface from @mercuryworkshop/proxy-transports
// so it can be passed to scramjet-controller `setTransport()` exactly like
// LibcurlClient or EpoxyClient.
//
// Pulsar is a WebRTC-Direct based transport: the browser connects directly
// to a Pulsar server (just an IP + UDP port, no signalling), then opens
// per-destination data channels that carry raw TCP. We tunnel libcurl.js
// over those data channels for full TLS-from-browser HTTPS proxying.

import type {
	ProxyTransport,
	RawHeaders,
	TransferrableResponse,
	WebSocketDataType
} from '@mercuryworkshop/proxy-transports';
import { libcurl } from 'libcurl.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- vite resolves ?url at build time
import libcurlWasmUrl from 'libcurl.js/libcurl.wasm?url';

import { connectDirect, type PulsarClientConnection } from './connection';
import { libcurlTransport } from './tunnel';
import { DEFAULT_PULSAR_HOST, DEFAULT_PULSAR_PORT } from './constants';

export interface PulsarClientOptions {
	/** Pulsar server IP address. Defaults to the official Abundance server. */
	host?: string;
	/** Pulsar server UDP port. Defaults to 4393. */
	port?: number;
}

let libcurlReady: Promise<void> | undefined;
async function ensureLibcurl(): Promise<void> {
	if (libcurlReady) return libcurlReady;
	libcurlReady = libcurl.load_wasm(libcurlWasmUrl);
	return libcurlReady;
}

export default class PulsarClient implements ProxyTransport {
	host: string;
	port: number;

	ready = false;

	private connection: PulsarClientConnection | undefined;
	private session: InstanceType<typeof libcurl.HTTPSession> | undefined;

	constructor(options: PulsarClientOptions = {}) {
		this.host = options.host || DEFAULT_PULSAR_HOST;
		this.port = options.port || DEFAULT_PULSAR_PORT;
	}

	private async ensureConnected(): Promise<void> {
		const conn = this.connection;
		if (
			conn &&
			conn.pc.connectionState === 'connected' &&
			conn.keepalive.readyState === 'open'
		) {
			return;
		}

		// Tear down stale state
		if (conn) {
			try {
				await conn.close();
			} catch {
				/* ignore */
			}
		}
		this.connection = undefined;
		try {
			this.session?.close();
		} catch {
			/* ignore */
		}
		this.session = undefined;

		console.log(
			`[Pulsar] connecting to ${this.host}:${this.port}`
		);
		const fresh = await connectDirect(this.host, this.port);
		this.connection = fresh;
		console.log('[Pulsar] connected');

		const factory = libcurlTransport(fresh.pc);
		// libcurl.js calls `new api.transport(url)` for custom transports.
		// Wrap in a constructor-shaped function so libcurl is happy.
		libcurl.transport = function (this: unknown, url: string) {
			return factory(url);
		} as unknown as typeof WebSocket;
		libcurl.set_websocket('wss://pulsar-tunnel.local/');
	}

	async init(): Promise<void> {
		await ensureLibcurl();
		await this.ensureConnected();
		this.session = new libcurl.HTTPSession();
		this.ready = true;
	}

	async request(
		remote: URL,
		method: string,
		body: BodyInit | null,
		headers: RawHeaders,
		signal: AbortSignal | undefined
	): Promise<TransferrableResponse> {
		await ensureLibcurl();
		await this.ensureConnected();

		if (!this.session) this.session = new libcurl.HTTPSession();

		// libcurl.js takes headers as an object map, not [k,v] pairs.
		const headersObj: Record<string, string> = {};
		for (const [key, value] of headers) {
			const lower = key.toLowerCase();
			if (
				lower === 'host' ||
				lower === 'connection' ||
				lower === 'keep-alive' ||
				lower === 'transfer-encoding'
			) {
				continue;
			}
			headersObj[key] = value;
		}

		const reqBody =
			body && method !== 'GET' && method !== 'HEAD' ? body : undefined;

		const payload = await this.session.fetch(remote.href, {
			method,
			headers: headersObj,
			body: reqBody,
			redirect: 'manual',
			signal
		});

		return {
			body: payload.body,
			headers: Array.isArray(payload.raw_headers)
				? payload.raw_headers
				: [...payload.headers],
			status: payload.status,
			statusText: payload.statusText
		};
	}

	connect(
		url: URL,
		protocols: string[],
		requestHeaders: RawHeaders,
		onopen: (protocol: string, extensions: string) => void,
		onmessage: (data: WebSocketDataType) => void,
		onclose: (code: number, reason: string) => void,
		onerror: (error: string) => void
	): [
		(data: WebSocketDataType) => void,
		(code: number, reason: string) => void
	] {
		let socket: WebSocket | undefined;

		const ready = (async () => {
			await ensureLibcurl();
			await this.ensureConnected();

			const headersObj: Record<string, string> = {};
			for (const [key, value] of requestHeaders) headersObj[key] = value;

			socket = new libcurl.WebSocket(url.toString(), protocols, {
				headers: headersObj
			}) as unknown as WebSocket;
			socket.binaryType = 'arraybuffer';
			socket.onopen = () => onopen('', '');
			socket.onclose = e => onclose(e.code, e.reason);
			socket.onerror = () => onerror('transport failed');
			socket.onmessage = e => onmessage(e.data);
		})();

		ready.catch(err => {
			console.error('[Pulsar] connect() setup failed:', err);
			onerror(err instanceof Error ? err.message : String(err));
		});

		return [
			data => {
				if (!socket || socket.readyState !== WebSocket.OPEN) {
					throw new Error('Pulsar WebSocket not open');
				}
				socket.send(data as ArrayBuffer | string);
			},
			(code, reason) => {
				socket?.close(code, reason);
			}
		];
	}
}

export { PulsarClient };
