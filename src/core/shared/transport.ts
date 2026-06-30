
import type {
	ProxyTransport,
	RawHeaders,
	TransferrableResponse
} from '@mercuryworkshop/proxy-transports';
import LibcurlClient from '@mercuryworkshop/libcurl-transport';
import EpoxyClient from '@mercuryworkshop/epoxy-transport';
import PulsarClient from '@pkgs/pulsar';
import type { SettingsAPI } from '@apis/settings';

export type TransportKind = 'libcurl' | 'epoxy' | 'pulsar';

/**
 * Normalized, serialisable description of how a transport should be
 * constructed. Two configs that JSON.stringify to the same value MUST
 * produce equivalent transport instances — the SW relies on this for
 * its caching.
 */
export interface TransportConfig {
	kind: TransportKind;
	/** WebSocket(WISP) URL. Required for libcurl/epoxy, ignored by pulsar. */
	wisp?: string;
	/** Optional upstream HTTP proxy. libcurl-only. */
	proxy?: string;
	/** Pulsar server host. Pulsar-only. */
	host?: string;
	/** Pulsar server UDP port. Pulsar-only. */
	port?: number;
}

export interface BuiltTransport {
	kind: TransportKind;
	instance: ProxyTransport;
	/** JSON-stringified `TransportConfig`, suitable for cache keys. */
	signature: string;
}

type TransportCtor = new (opts: Record<string, unknown>) => ProxyTransport;

const TRANSPORT_MAP: Record<
	TransportKind,
	{ ctor: TransportCtor; opts: readonly (keyof TransportConfig)[] }
> = {
	libcurl: {
		ctor: LibcurlClient as unknown as TransportCtor,
		opts: ['wisp', 'proxy']
	},
	epoxy: {
		ctor: EpoxyClient as unknown as TransportCtor,
		opts: ['wisp']
	},
	pulsar: {
		ctor: PulsarClient as unknown as TransportCtor,
		opts: ['host', 'port']
	}
};

const DEFAULT_KIND: TransportKind = 'libcurl';

/**
 * Reads transport-related settings and produces a normalized
 * `TransportConfig`. Mirrors the resolution rules in
 * `Proxy.buildTransportConfig` (src/apis/proxy.ts:432) — same setting
 * names, same fallbacks, same ignored-string list for the proxy field.
 *
 * `defaultWisp` is invoked only when the `wisp` setting is missing AND
 * the chosen transport actually needs a wisp URL. Callers supply this so
 * the SW and the page can disagree about how to derive a default (the
 * page may want to probe the server, the SW may just synthesise one).
 */
export async function resolveTransportConfig(
	settings: SettingsAPI,
	defaultWisp: () => string | Promise<string>
): Promise<TransportConfig> {
	const requestedRaw = await settings.getItem<string>('transports');
	const kind: TransportKind =
		requestedRaw === 'epoxy' || requestedRaw === 'pulsar'
			? requestedRaw
			: DEFAULT_KIND;

	if (kind === 'pulsar') {
		const savedHost = await settings.getItem<string>('pulsarHost');
		const savedPort = await settings.getItem<string | number>('pulsarPort');
		const cfg: TransportConfig = { kind };
		if (savedHost) cfg.host = String(savedHost);
		if (savedPort != null) {
			const portNum = Number(savedPort);
			if (Number.isFinite(portNum) && portNum > 0) cfg.port = portNum;
		}
		return cfg;
	}

	const savedWisp = await settings.getItem<string>('wisp');
	const wisp = savedWisp || (await defaultWisp());
	const cfg: TransportConfig = { kind, wisp };

	if (kind === 'libcurl') {
		const remoteProxy = await settings.getItem<string>('proxyServer');
		if (
			remoteProxy &&
			remoteProxy !== 'undefined' &&
			remoteProxy !== 'null' &&
			remoteProxy !== 'disabled' &&
			remoteProxy !== 'false'
		) {
			cfg.proxy = remoteProxy;
		}
	}

	return cfg;
}

/**
 * Constructs a transport instance from a normalized config. Pure — does
 * not read settings, does not perform IO. The returned `signature` is a
 * stable JSON encoding of the input config and is safe to use as a cache
 * key.
 */
export function buildTransport(cfg: TransportConfig): BuiltTransport {
	const entry = TRANSPORT_MAP[cfg.kind] ?? TRANSPORT_MAP[DEFAULT_KIND];

	const ctorOpts: Record<string, unknown> = {};
	for (const key of entry.opts) {
		const value = cfg[key];
		if (value !== undefined) ctorOpts[key] = value;
	}

	const instance = new entry.ctor(ctorOpts);
	return {
		kind: cfg.kind,
		instance,
		signature: JSON.stringify(cfg)
	};
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;

function readHeader(rawHeaders: unknown, name: string): string | null {
	const needle = name.toLowerCase();

	if (rawHeaders instanceof Headers) {
		return rawHeaders.get(name);
	}

	if (Array.isArray(rawHeaders)) {
		for (const entry of rawHeaders) {
			if (
				Array.isArray(entry) &&
				entry.length >= 2 &&
				typeof entry[0] === 'string' &&
				entry[0].toLowerCase() === needle
			) {
				return String(entry[1]);
			}
		}
		return null;
	}

	if (rawHeaders && typeof rawHeaders === 'object') {
		for (const [key, value] of Object.entries(
			rawHeaders as Record<string, unknown>
		)) {
			if (key.toLowerCase() === needle) {
				return String(value);
			}
		}
	}

	return null;
}

function normalizeHeaderEntries(rawHeaders: unknown): RawHeaders {
	if (rawHeaders instanceof Headers) {
		return Array.from(rawHeaders.entries());
	}

	if (Array.isArray(rawHeaders)) {
		return rawHeaders
			.filter(
				(entry: unknown): entry is [string, unknown] =>
					Array.isArray(entry) &&
					entry.length >= 2 &&
					typeof entry[0] === 'string'
			)
			.map(entry => [String(entry[0]), String(entry[1])]);
	}

	if (rawHeaders && typeof rawHeaders === 'object') {
		return Object.entries(rawHeaders as Record<string, unknown>).map(
			([key, value]) => [key, String(value)]
		);
	}

	return [];
}

function toRawHeaders(headers: HeadersInit | undefined): RawHeaders {
	if (!headers) return [];
	if (headers instanceof Headers) return Array.from(headers.entries());
	if (Array.isArray(headers))
		return headers
			.filter(
				(entry): entry is [string, string] =>
					Array.isArray(entry) &&
					entry.length >= 2 &&
					typeof entry[0] === 'string'
			)
			.map(([k, v]) => [k, String(v)]);
	return Object.entries(headers as Record<string, string>).map(([k, v]) => [
		k,
		String(v)
	]);
}

export interface TransportFetchInit {
	method?: string;
	body?: BodyInit | null;
	headers?: HeadersInit;
	signal?: AbortSignal;
	/** Override the redirect cap (default 20). 0 disables following. */
	maxRedirects?: number;
}

/**
 * Performs a request through a constructed transport, manually following
 * HTTP redirects and normalising the response into a real `Response`.
 *
 * Mirrors the behavior of `Proxy.fetch` (src/apis/proxy.ts:747-894):
 *   - `transport.init()` is invoked if the transport isn't `ready`
 *   - same redirect status set (301/302/303/307/308), same default cap
 *   - response body, status, statusText preserved verbatim
 *   - response headers reconstructed from whatever shape the transport
 *     returned them in (Headers / array / plain object)
 */
export async function transportFetch(
	transport: ProxyTransport,
	url: string | URL,
	init: TransportFetchInit = {}
): Promise<Response> {
	if (!transport) {
		throw new Error('[transportFetch] Transport is unavailable');
	}

	if (!transport.ready && typeof transport.init === 'function') {
		await transport.init();
	}

	let remote: URL =
		url instanceof URL
			? url
			: new URL(typeof url === 'string' ? url : String(url));

	const method = (init.method ?? (init.body == null ? 'GET' : 'POST'))
		.toString()
		.toUpperCase();
	const headers = toRawHeaders(init.headers);
	const body = init.body ?? null;
	const cap = init.maxRedirects ?? MAX_REDIRECTS;

	let response: TransferrableResponse | null = null;

	for (let i = 0; i <= cap; i++) {
		response = await transport.request(
			remote,
			method,
			body,
			headers,
			init.signal
		);

		if (!REDIRECT_CODES.has(response?.status)) break;

		const location = readHeader(response?.headers, 'location');
		if (!location) break;

		remote = new URL(location, remote);
	}

	if (!response) {
		throw new Error('[transportFetch] No response returned from transport');
	}

	const responseHeaders = new Headers();
	for (const [key, value] of normalizeHeaderEntries(response.headers)) {
		responseHeaders.append(key, value);
	}

	return new Response(
		(response.body as BodyInit | null | undefined) ?? null,
		{
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		}
	);
}
