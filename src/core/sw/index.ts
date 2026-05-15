import { SettingsAPI } from '@apis/settings';

import {
	primeJsonCache,
	serveInternalPage,
	serveJsonFile,
	serveResFile
} from '@core/sw/cache';
import { installConsolePolyfill } from '@core/sw/console';
import { basePath, stripBase } from '@core/shared/path';
import {
	createCorsPreflightResponse,
	getErrorMessage,
	isCfRequest,
	isAdRequest,
	isInternalRoute,
	isJsonCacheRoute,
	isResCacheRoute,
	isServerRoutedEndpoint,
	shouldRestoreRequest
} from '@core/sw/req';
import { WispManager } from '@core/sw/wisp';

if (navigator.userAgent.includes('Firefox')) {
	Object.defineProperty(globalThis, 'crossOriginIsolated', {
		value: true,
		writable: false
	});
}

installConsolePolyfill();

type FetchEventLike = {
	request: Request;
	respondWith: (response: Response | Promise<Response>) => void;
};

type ExtendableEventLike = {
	waitUntil: (promise: Promise<unknown>) => void;
};

type MessageEventLike = {
	data?: { type?: string };
};

declare function importScripts(...urls: string[]): void;

const swSelf = self as unknown as {
	skipWaiting: () => void;
	clients: { claim: () => Promise<void> };
	addEventListener: (type: string, listener: (event: any) => void) => void;
};

importScripts(basePath + 'baremux/index.js');
importScripts(basePath + 'assets/sw.js');

type BareClientInstance = {
	fetch: (
		input: RequestInfo | URL,
		init?: {
			method?: string;
			headers?: Record<string, string>;
			body?: BodyInit;
		}
	) => Promise<Response>;
};

declare const BareMux: {
	BareClient: new () => BareClientInstance;
};

class DDXWorker {
	private readonly cfBlockPatterns = ['**/cdn-cgi/**'];
	private readonly restoredEndpoints = [
		'/api/results/',
		'/api/plus',
		'/api/store/',
		'/auth/',
		'/auth'
	];
	private readonly serverRoutedEndpoints = [
		'/api/results/',
		'/auth/',
		'/auth'
	];
	private hasServerRoutes: boolean | null = null;
	private readonly productionUrl = 'https://daydreamx.pro';
	private bareClient: BareClientInstance | null = null;
	private transportReadyResolve: (() => void) | null = null;
	private readonly transportReady: Promise<void>;
	private readonly wispManager: WispManager;
	private readonly settings: SettingsAPI;

	constructor() {
		this.settings = new SettingsAPI();
		this.wispManager = new WispManager(this.settings);
		this.transportReady = new Promise(resolve => {
			this.transportReadyResolve = resolve;
		});
	}

	onTransportReady(): void {
		console.log(
			'[DDXWorker] Transport ready signal received from main thread'
		);
		if (this.transportReadyResolve) {
			this.transportReadyResolve();
			this.transportReadyResolve = null;
		}
	}

	private getBareClient(): BareClientInstance {
		if (!this.bareClient) {
			console.log('[DDXWorker] Creating singleton BareClient');
			this.bareClient = new BareMux.BareClient();
		}
		return this.bareClient;
	}

	private async checkHasServerRoutes(): Promise<boolean> {
		if (this.hasServerRoutes !== null) {
			return this.hasServerRoutes;
		}

		try {
			const checkUrl = new URL('/api/results/', self.location.origin);
			checkUrl.searchParams.set('__ddx_route_check', '1');
			const response = await fetch(checkUrl.toString(), {
				method: 'GET',
				cache: 'no-store'
			});

			this.hasServerRoutes = response.status !== 404;

			console.log(
				`[DDXWorker] Server routes check: ${this.hasServerRoutes ? 'available (status: ' + response.status + ')' : 'not available'}`
			);

			return this.hasServerRoutes;
		} catch (err) {
			console.log(
				'[DDXWorker] Server routes check failed:',
				getErrorMessage(err)
			);
			this.hasServerRoutes = false;
			return false;
		}
	}

	private async restoreRequest(request: Request): Promise<Response> {
		const originalUrl = new URL(request.url);
		const relativePath = stripBase(originalUrl.pathname);
		const productionUrl = new URL(
			relativePath + originalUrl.search,
			this.productionUrl
		);

		console.log(
			`[DDXWorker] restoreRequest: ${request.method} ${relativePath} -> ${productionUrl.toString()}`
		);

		const headers: Record<string, string> = {};
		for (const [key, value] of request.headers.entries()) {
			if (key.toLowerCase() === 'host') continue;
			headers[key] = value;
		}

		const fetchOptions: {
			method: string;
			headers: Record<string, string>;
			body?: ArrayBuffer;
		} = {
			method: request.method,
			headers
		};

		if (request.method !== 'GET' && request.method !== 'HEAD') {
			fetchOptions.body = await request.clone().arrayBuffer();
		}

		const transportTimeoutMs = 15000;
		try {
			await Promise.race([
				this.transportReady,
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error('Transport ready timeout')),
						transportTimeoutMs
					)
				)
			]);
		} catch (err) {
			console.warn(
				`[DDXWorker] Transport not ready within ${transportTimeoutMs}ms, attempting fetch anyway:`,
				getErrorMessage(err)
			);
		}

		const client = this.getBareClient();

		try {
			const response = await client.fetch(
				productionUrl.toString(),
				fetchOptions
			);

			console.log(
				`[DDXWorker] restoreRequest OK: ${response.status} ${relativePath}`
			);

			const responseHeaders = new Headers();
			for (const [key, value] of response.headers.entries()) {
				responseHeaders.set(key, value);
			}

			responseHeaders.set('Access-Control-Allow-Origin', '*');
			responseHeaders.set(
				'Access-Control-Allow-Methods',
				'GET, POST, PUT, DELETE, OPTIONS'
			);
			responseHeaders.set('Access-Control-Allow-Headers', '*');

			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: responseHeaders
			});
		} catch (error) {
			console.error(
				'[DDXWorker] restoreRequest failed:',
				getErrorMessage(error)
			);
			this.bareClient = null;

			return new Response(
				JSON.stringify({
					error: 'Proxy error',
					message: 'Failed to proxy request to backend',
					details: String(error)
				}),
				{
					status: 502,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*'
					}
				}
			);
		}
	}

	private async isAdBlockEnabled(): Promise<boolean> {
		const adblockSetting = await this.settings.getItem<boolean>('adblock');
		if (adblockSetting !== null) {
			return adblockSetting;
		}

		// Default to disabled if not set
		return false;
	}

	async handleRequest(event: FetchEventLike): Promise<Response> {
		const url = new URL(event.request.url);
		const relativePath = stripBase(url.pathname);

		if (url.searchParams.has('__ddx_route_check')) {
			return fetch(event.request);
		}

		await this.wispManager.ensureWisp();

		if (isCfRequest(event.request.url, this.cfBlockPatterns)) {
			return new Response(null, { status: 204 });
		}

		if (
			(await this.isAdBlockEnabled()) &&
			isAdRequest(event.request.url, event.request)
		) {
			return new Response(null, { status: 204 });
		}

		if (isInternalRoute(relativePath)) {
			if (!/\.\w+$/.test(relativePath) && !relativePath.endsWith('/')) {
				const redirectUrl = new URL(event.request.url);
				redirectUrl.pathname += '/';
				return Response.redirect(redirectUrl.toString(), 301);
			}
			return serveInternalPage(relativePath);
		}

		if (isJsonCacheRoute(relativePath) && event.request.method === 'GET') {
			return serveJsonFile(relativePath);
		}

		if (isResCacheRoute(relativePath) && event.request.method === 'GET') {
			return serveResFile(relativePath);
		}

		if (shouldRestoreRequest(relativePath, this.restoredEndpoints)) {
			if (
				isServerRoutedEndpoint(relativePath, this.serverRoutedEndpoints)
			) {
				const hasServerRoutes = await this.checkHasServerRoutes();
				if (hasServerRoutes) {
					console.log(
						`[DDXWorker] Using server route for ${event.request.method} ${relativePath}`
					);
					const serverUrl = new URL(
						relativePath + url.search,
						url.origin
					);
					const serverRequest = new Request(
						serverUrl.toString(),
						event.request
					);
					return fetch(serverRequest);
				}
			}

			if (event.request.method === 'OPTIONS') {
				return createCorsPreflightResponse();
			}

			return this.restoreRequest(event.request);
		}

		try {
			const sjController = $scramjetController as unknown as {
				shouldRoute: (event: FetchEventLike) => boolean;
				route: (event: FetchEventLike) => Promise<Response>;
			};
			if (sjController.shouldRoute(event)) {
				return sjController.route(event);
			}
		} catch (e) {
			console.warn('[DDXWorker] Scramjet route/fetch error:', e);
		}

		return fetch(event.request);
	}

	async ensureWisp(): Promise<boolean> {
		return this.wispManager.ensureWisp();
	}

	async primeCache(): Promise<void> {
		await primeJsonCache();
	}
}

const ddx = new DDXWorker();

swSelf.addEventListener('install', () => {
	console.log('[DDXWorker] Installing...');
	swSelf.skipWaiting();
});

swSelf.addEventListener('activate', (event: ExtendableEventLike) => {
	console.log('[DDXWorker] Activating...');
	event.waitUntil(
		swSelf.clients
			.claim()
			.then(() => ddx.primeCache())
			.then(() => ddx.ensureWisp())
	);
});

swSelf.addEventListener('message', (event: MessageEventLike) => {
	const data = event.data;
	if (!data?.type) return;

	switch (data.type) {
		case 'transportReady':
			ddx.onTransportReady();
			break;
		default:
			console.log('[DDXWorker] Unknown message type:', data.type);
			break;
	}
});

swSelf.addEventListener('fetch', (event: FetchEventLike) => {
	event.respondWith(
		ddx.handleRequest(event).catch(err => {
			console.error(
				'[DDXWorker] handleRequest failed, passing through:',
				err
			);
			return fetch(event.request);
		})
	);
});
