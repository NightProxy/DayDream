
import type {
	ProxyTransport,
	RawHeaders,
	TransferrableResponse
} from '@mercuryworkshop/proxy-transports';

interface TransportSettings {
	getItem<T>(key: string): Promise<T | null>;
}

export type TransportKind = 'libcurl' | 'pulsar';

export interface TransportConfig {
	kind: TransportKind;
	wisp?: string;
	proxy?: string;
	host?: string;
	port?: number;
}

export interface BuiltTransport {
	kind: TransportKind;
	instance: ProxyTransport;
	signature: string;
}

type TransportCtor = new (opts: Record<string, unknown>) => ProxyTransport;

const TRANSPORT_OPTS: Record<TransportKind, readonly (keyof TransportConfig)[]> = {
	libcurl: ['wisp', 'proxy'],
	pulsar: ['host', 'port']
};

const DEFAULT_KIND: TransportKind = 'libcurl';

async function loadTransportCtor(kind: TransportKind): Promise<TransportCtor> {
	switch (kind) {
		case 'libcurl': {
			const { default: LibcurlClient } = await import('@mercuryworkshop/libcurl-transport');
			return LibcurlClient as unknown as TransportCtor;
		}
		case 'pulsar': {
			const { default: PulsarClient } = await import('@pkgs/pulsar');
			return PulsarClient as unknown as TransportCtor;
		}
	}
}

/**
 * Reads transport-related settings and produces a normalized
 * `TransportConfig`. Mirrors the resolution rules in
 * `Proxy.buildTransportConfig` (src/apis/proxy.ts) — same setting
 * names, same fallbacks, same ignored-string list for the proxy field.
 *
 * `defaultWisp` is invoked only when the `wisp` setting is missing AND
 * the chosen transport actually needs a wisp URL. Callers supply this so
 * the SW and the page can disagree about how to derive a default (the
 * page may want to probe the server, the SW may just synthesise one).
 */
export async function resolveTransportConfig(
	settings: TransportSettings,
	defaultWisp: () => string | Promise<string>
): Promise<TransportConfig> {
	const requestedRaw = await settings.getItem<string>('transports');
	const kind: TransportKind =
		requestedRaw === 'pulsar'
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
 * Constructs a transport instance from a normalized config.
 * Lazily imports the transport library so the bundle is not inflated
 * until the transport is actually needed (first proxied navigation).
 */
export async function buildTransport(cfg: TransportConfig): Promise<BuiltTransport> {
	const kind: TransportKind = cfg.kind in TRANSPORT_OPTS ? cfg.kind : DEFAULT_KIND;
	const ctor = await loadTransportCtor(kind);
	const opts = TRANSPORT_OPTS[kind];

	const ctorOpts: Record<string, unknown> = {};
	for (const key of opts) {
		const value = cfg[key];
		if (value !== undefined) ctorOpts[key] = value;
	}

	const instance = new ctor(ctorOpts);
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
