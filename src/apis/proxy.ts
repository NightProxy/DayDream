import * as BareMux from '@mercuryworkshop/bare-mux';
import { Logger } from '@apis/logging';
import { SettingsAPI } from '@apis/settings';
import { HostingAPI } from '@apis/platform/hosting';
import { NetworkAPI } from '@apis/platform/network';
import { basePath, resolvePath } from '@utils/basepath';
import LibcurlClient from '@mercuryworkshop/libcurl-transport';
import EpoxyClient from '@mercuryworkshop/epoxy-transport';

interface ProxyInterface {
	connection: BareMux.BareMuxConnection;
	searchVar: string;
	transportVar: string;
	wispUrl: string;
	logging: Logger;
	settings: SettingsAPI;
	hosting: HostingAPI;
	network: NetworkAPI;
	isStaticBuild: boolean;
	initReady: Promise<void>;
	setTransports(): Promise<void>;
	getTransports(includeLegacyConnection?: boolean): Promise<{
		active: string;
		controller: any;
		wisp: string;
	}>;
	search(input: string): string;
	registerSW(swConfig: any): Promise<void>;
	updateSW(): void;
	uninstallSW(): void;
	redirect(
		swConfig: Record<any, any>,
		proxySetting: string,
		url: string
	): Promise<void>;
	fetch(
		url: string,
		method?: string,
		body?: any,
		headers?: [string, string][]
	): Promise<Response>;
	getFavicon(url: string): Promise<string | null>;
	generateWispServer(): string;
	checkServerWisp(): Promise<boolean>;
	swapWispServer(url?: string): Promise<void>;
	libcurl: LibcurlClient;
	epoxy: EpoxyClient;
	controller: any;
}
class Proxy implements ProxyInterface {
	connection!: BareMux.BareMuxConnection;
	searchVar!: string;
	transportVar!: string;
	wispUrl!: string;
	settings!: SettingsAPI;
	logging!: Logger;
	hosting!: HostingAPI;
	network!: NetworkAPI;
	isStaticBuild: boolean = false;
	initReady: Promise<void>;
	libcurl!: LibcurlClient;
	epoxy!: EpoxyClient;
	controller: any;
	private activeTransport: string = 'libcurl';
	private readonly controllerConfig: SJConfig;
	private readonly scramjetFlags: SJFlags;
	constructor(Controller: any, SW: any, config: SJConfig, flags: SJFlags) {
		this.connection = new BareMux.BareMuxConnection(
			resolvePath('bmworker/worker.js')
		);

		this.settings = new SettingsAPI();
		this.hosting = new HostingAPI();
		this.network = new NetworkAPI();
		this.logging = new Logger();
		this.isStaticBuild = false;
		this.controllerConfig = config;
		this.scramjetFlags = flags;

		this.initReady = (async () => {
			this.searchVar =
				(await this.settings.getItem('search')) ||
				'https://www.duckduckgo.com/?q=%s';
			this.transportVar =
				(await this.settings.getItem('transports')) || 'libcurl';

			const savedWisp = await this.settings.getItem('wisp');
			if (savedWisp) {
				this.wispUrl = savedWisp;
				console.log(`[Proxy] Using saved WISP: ${this.wispUrl}`);
			} else {
				const serverHasWisp = await this.checkServerWisp();
				if (serverHasWisp) {
					this.wispUrl =
						(location.protocol === 'https:' ? 'wss' : 'ws') +
						'://' +
						location.host +
						'/wisp/';
					await this.settings.setItem('wisp', this.wispUrl);
					console.log(
						`[Proxy] Using server /wisp/ endpoint: ${this.wispUrl}`
					);
				} else {
					const generated = this.generateWispServer();
					this.wispUrl = generated;
					await this.settings.setItem('wisp', generated);
					console.log(
						`[Proxy] No /wisp/ on server, generated: ${generated}`
					);
				}
			}

			const transportConfig = await this.buildTransportConfig();

			this.controller = new Controller({
				serviceworker: navigator.serviceWorker.controller ?? SW.active,
				transport: transportConfig.instance,
				config: this.controllerConfig,
				scramjetConfig: this.scramjetFlags
			});
			await this.controller.wait();
		})();
	}

	async createFrame(element?: HTMLIFrameElement): Promise<any> {
		await this.initReady;
		return this.controller.createFrame(element);
	}

	/**
	 * Navigate a registered scramjet frame to a URL using scramjet's
	 * built-in URL rewriting (Frame.go). This is the v2-correct way to
	 * navigate a proxied frame - it handles encoding, base URL, sourcemaps
	 * etc. internally.
	 *
	 * Returns true on success, false if the frame isn't registered.
	 */
	async navigateFrame(
		target: HTMLIFrameElement | string,
		url: string
	): Promise<boolean> {
		await this.initReady;
		const element = this.resolveFrameElement(target);
		if (!element) return false;

		const frame = this.controller.frames.find(
			(f: any) => f.element === element
		);
		if (!frame || typeof frame.go !== 'function') return false;

		frame.go(url);
		return true;
	}

	deleteFrame(
		target: HTMLIFrameElement | string,
		removeElement: boolean = true
	): boolean {
		if (!this.controller || !Array.isArray(this.controller.frames)) {
			return false;
		}

		const element = this.resolveFrameElement(target);
		if (!element) return false;

		const frames = this.controller.frames;
		const index = frames.findIndex(
			(frame: any) => frame.element === element
		);

		if (index === -1) return false;

		const frame = frames[index];

		try {
			if (typeof frame.destroy === 'function') {
				frame.destroy();
			} else if (typeof frame.dispose === 'function') {
				frame.dispose();
			} else if (typeof frame.close === 'function') {
				frame.close();
			}
		} catch (err) {
			console.warn('[Proxy] Error during frame teardown:', err);
		}

		try {
			if (frame.fetchHandler?.trackedClients?.clear) {
				frame.fetchHandler.trackedClients.clear();
			}
		} catch (err) {
			console.warn('[Proxy] Error clearing tracked clients:', err);
		}

		frames.splice(index, 1);

		if (removeElement && element.parentNode) {
			element.remove();
		}

		return true;
	}

	private resolveFrameElement(
		target: HTMLIFrameElement | string
	): HTMLIFrameElement | null {
		if (typeof target === 'string') {
			const el = document.querySelector(target);
			return el instanceof HTMLIFrameElement ? el : null;
		}
		return target instanceof HTMLIFrameElement ? target : null;
	}

	getPrefixByFrame(target: HTMLIFrameElement | string): string | null {
		//tricky and jank logic to get the prefix for a frame for v2, because new prefix system can't be predicited or adjusted
		const element = this.resolveFrameElement(target);
		if (!element) return null;
		const frames = this.controller.frames;
		for (const frame of frames) {
			if (frame.element === element) {
				return frame.prefix;
			}
		}
		return null;
	}

	getScramObjectByFrame(target: HTMLIFrameElement | string): any | null {
		const element = this.resolveFrameElement(target);
		if (!element) return null;
		const frames = this.controller.frames;
		for (const frame of frames) {
			if (frame.element === element) {
				return frame;
			}
		}
		return null;
	}

	/**
	 * Returns the codec used by the active Scramjet config.
	 * Falls back to encodeURIComponent/decodeURIComponent if controller isn't ready.
	 */
	private getCodec(): {
		encode: (s: string) => string;
		decode: (s: string) => string;
	} {
		const controllerCodec =
			this.controller?.config?.codec ||
			this.controller?.scramjetConfig?.codec;
		if (controllerCodec?.encode && controllerCodec?.decode) {
			return controllerCodec;
		}
		const globalCodec = (self as any).__scramjet$config?.codec;
		if (globalCodec?.encode && globalCodec?.decode) {
			return globalCodec;
		}
		return {
			encode: (s: string) => {
				try {
					return encodeURIComponent(s);
				} catch {
					return s;
				}
			},
			decode: (s: string) => {
				try {
					return decodeURIComponent(s);
				} catch {
					return s;
				}
			}
		};
	}

	encodeUrl(url: string): string {
		if (!url) return url;
		return this.getCodec().encode(url.toString());
	}

	decodeUrl(url: string): string {
		if (!url) return url;
		try {
			return this.getCodec().decode(url);
		} catch {
			return url;
		}
	}

	/**
	 * Given an iframe (or selector) whose src is a Scramjet-rewritten URL,
	 * strip the per-frame prefix and decode the underlying URL.
	 * Returns null if the frame isn't registered or the src doesn't match.
	 *
	 * Also accepts a raw URL string + optional explicit prefix as a fallback.
	 *
	 * Scramjet builds rewritten URLs as
	 *     prefix.href + codecEncode(href) + searchPart + hashPart
	 * — the query string and fragment are appended OUTSIDE the codec payload.
	 * If we hand the slice including `?...` / `#...` straight to the codec,
	 * Obscura sees an invalid Z85 string (length not a multiple of 5, or
	 * non-Z85 characters) and throws. So we split those off, decode just the
	 * encoded segment, then reattach.
	 */
	extractEncodedUrl(
		target: HTMLIFrameElement | string,
		opts?: { url?: string; prefix?: string }
	): string | null {
		let url: string | undefined = opts?.url;
		let prefix: string | undefined = opts?.prefix;

		const element = this.resolveFrameElement(target);
		if (element) {
			url ??= element.src;
			prefix ??= this.getPrefixByFrame(element) ?? undefined;
		}

		// Last-resort fallbacks
		if (!prefix) {
			prefix =
				this.controller?.prefix ||
				(self as any).__scramjet$config?.prefix;
		}

		if (!url || !prefix) return null;
		const idx = url.indexOf(prefix);
		if (idx === -1) return null;
		const tail = url.slice(idx + prefix.length);

		// Split off ?query and #hash so the codec only sees the pure encoded
		// path segment. Scramjet places `?` before `#`, mirror that order.
		const hashIdx = tail.indexOf('#');
		const beforeHash = hashIdx === -1 ? tail : tail.slice(0, hashIdx);
		const hashPart = hashIdx === -1 ? '' : tail.slice(hashIdx);

		const queryIdx = beforeHash.indexOf('?');
		const encoded =
			queryIdx === -1 ? beforeHash : beforeHash.slice(0, queryIdx);
		const queryPart = queryIdx === -1 ? '' : beforeHash.slice(queryIdx);

		const decoded = this.decodeUrl(encoded);
		// If decode failed (returned input unchanged) we still want to give
		// callers something best-effort, but reattaching query+hash to a
		// not-actually-decoded blob would be misleading. Return the decoded
		// payload + reattached query/hash only when decode actually changed
		// the input.
		if (decoded === encoded) return decoded;

		// Reattach query/hash if the decoded URL doesn't already carry them
		// (Obscura's decoded output IS the original URL, which may itself
		// already contain `?...#...`).
		let out = decoded;
		if (queryPart && !out.includes('?')) out += queryPart;
		else if (queryPart) out += queryPart.replace(/^\?/, '&');
		if (hashPart && !out.includes('#')) out += hashPart;
		return out;
	}

	checkServerWisp(): Promise<boolean> {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${proto}//${location.host}/wisp/`;

		return new Promise(resolve => {
			const timeout = setTimeout(() => {
				ws.close();
				resolve(false);
			}, 5000);

			const ws = new WebSocket(url);

			ws.addEventListener('open', () => {
				clearTimeout(timeout);
				console.log(`[Proxy] Server /wisp/ endpoint found at ${url}`);
				ws.close();
				resolve(true);
			});

			ws.addEventListener('error', () => {
				clearTimeout(timeout);
				console.log('[Proxy] Server /wisp/ endpoint not available');
				resolve(false);
			});
		});
	}

	generateWispServer(): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		const length = 16 + Math.floor(Math.random() * 17);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars[Math.floor(Math.random() * chars.length)];
		}
		return `wss://${result}.nightwisp.me.cdn.cloudflare.net/wisp/`;
	}

	async swapWispServer(url?: string): Promise<void> {
		const newWisp = url || this.generateWispServer();
		this.wispUrl = newWisp;
		await this.settings.setItem('wisp', newWisp);
		console.log(`[Proxy] WISP server swapped to: ${newWisp}`);
		await this.setTransports();
	}

	async TransportMapping(): Promise<Record<any, any>> {
		return {
			epoxy: {
				constructor: EpoxyClient,
				opts: ['wisp'],
			},
			libcurl: {
				constructor: LibcurlClient,
				opts: ['wisp', 'proxy'],
			}
		};
	}

	private async buildTransportConfig() {
		const transportMap = await this.TransportMapping();
		const selectedTransport = this.transportVar || 'libcurl';
		const fallbackTransport = transportMap.libcurl;
		const mappedTransport =
			transportMap[selectedTransport] || fallbackTransport;

		this.activeTransport = transportMap[selectedTransport]
			? selectedTransport
			: 'libcurl';

		const wispUrl =
			this.wispUrl ||
			(location.protocol === 'https:' ? 'wss' : 'ws') +
				'://' +
				location.host +
				'/wisp/';

		const clientOptions: Record<string, any> = {
			wisp: wispUrl
		};

		const remoteProxyServer = await this.getRemoteProxyServer();
		if (
			this.activeTransport === 'libcurl' &&
			remoteProxyServer &&
			remoteProxyServer !== 'undefined' &&
			remoteProxyServer !== 'null' &&
			remoteProxyServer !== 'disabled' &&
			remoteProxyServer !== 'false'
		) {
			clientOptions.proxy = remoteProxyServer;
		}

		const transportOptions: Record<string, any> = {
			wisp: wispUrl
		};

		if (clientOptions.proxy) {
			transportOptions.proxy = clientOptions.proxy;
		}

		return {
			key: this.activeTransport,
			instance: new mappedTransport.constructor(clientOptions),
			connectionOptions: transportOptions
		};
	}

	async setTransports() {
		await this.initReady;
		console.log('[Proxy] setTransports() called, wispUrl:', this.wispUrl);
		const transportConfig = await this.buildTransportConfig();

		if (
			this.controller &&
			typeof this.controller.setTransport === 'function'
		) {
			await this.controller.setTransport(transportConfig.instance);
		}

		console.log('[Proxy] Transport set with options:', {
			controller: transportConfig.key
		});
		if (this.logging) {
			this.logging.createLog(`Transport Set: ${transportConfig.key}`);
		}

		this.notifySwTransportReady();
	}

	private async notifySwTransportReady() {
		try {
			const registration = await navigator.serviceWorker?.ready;
			if (registration?.active) {
				registration.active.postMessage({ type: 'transportReady' });
				console.log('[Proxy] Sent transportReady to SW');
			}
		} catch (err) {
			console.warn(
				'[Proxy] Failed to notify SW of transport ready:',
				err
			);
		}
	}

	async getTransports() {
		await this.initReady;
		const controllerTransport =
			typeof this.controller?.getTransport === 'function'
				? await this.controller.getTransport()
				: (this.controller?.transport ?? null);

		return {
			active: this.activeTransport,
			controller: controllerTransport,
			wisp: this.wispUrl
		};
	}

	search(input: string) {
		input = input.trim();
		const searchTemplate =
			this.searchVar || 'https://www.duckduckgo.com/?q=%s';

		if (input.includes('.') && input.includes(' ')) {
			return searchTemplate.replace('%s', encodeURIComponent(input));
		}

		try {
			return new URL(input).toString();
		} catch (err) {
			try {
				const url = new URL(`http://${input}`);
				if (url.hostname.includes('.')) {
					return url.toString();
				}
				throw new Error('Invalid hostname');
			} catch (err) {
				return searchTemplate.replace('%s', encodeURIComponent(input));
			}
		}
	}

	async registerSW(swConfig: Record<any, any>) {
		if ('serviceWorker' in navigator) {
			// In v2, a single SW at the root base path handles all routing
			// (including scramjet via $scramjetController.shouldRoute/route).
			// Registering a narrower scope (e.g. /assets/) would create a
			// stale, conflicting registration that intercepts proxy URLs
			// without our routing logic. Always use the root scope.
			const scpe: string = basePath;
			console.log('[Proxy] Registering service worker with scope:', scpe);
			await navigator.serviceWorker.register(swConfig.file, {
				scope: scpe
			});

			navigator.serviceWorker.ready.then(async () => {
				console.log(
					'[Proxy] Service worker ready, setting up transports'
				);
				await this.setTransports().then(async () => {
					const transportState = await this.getTransports();
					if (transportState.controller == null) {
						console.log(
							'[Proxy] Controller transport null, retrying setTransports'
						);
						this.setTransports();
					}
				});
				this.updateSW();
			});
		}
	}

	updateSW() {
		const self = this;
		navigator.serviceWorker
			.getRegistrations()
			.then(function (registrations) {
				registrations.forEach(registration => {
					registration.update();
					self.logging.createLog(
						`Service Worker at ${registration.scope} Updated`
					);
				});
			});
	}

	uninstallSW() {
		const self = this;
		navigator.serviceWorker
			.getRegistrations()
			.then(function (registrations) {
				registrations.forEach(registration => {
					registration.unregister();
					self.logging.createLog(
						`Service Worker at ${registration.scope} Unregistered`
					);
				});
			});
	}

	/**
	 * Resolves the prefix to use when encoding a URL for an iframe.
	 * Prefers the per-frame prefix (v2), falls back to the base config prefix.
	 */
	private resolveEncodingPrefix(
		swConfigSettings: Record<any, any>,
		iframe?: HTMLIFrameElement | null
	): string {
		// v2: try per-frame prefix first
		if (iframe) {
			const framePrefix = this.getPrefixByFrame(iframe);
			if (framePrefix) return framePrefix;
		}

		// v2 fallback: controller has only one frame? use it
		const frames = this.controller?.frames;
		if (frames && frames.length === 1 && frames[0]?.prefix) {
			return frames[0].prefix;
		}

		// Last resort - the base scramjet prefix from config (v1 / no frame yet)
		return swConfigSettings.config.prefix;
	}

	async redirect(
		swConfig: Record<any, any>,
		proxySetting: string,
		url: any,
		targetIframe?: HTMLIFrameElement
	) {
		console.log(
			'[Proxy] redirect() called with url:',
			url,
			'proxySetting:',
			proxySetting
		);
		let swConfigSettings: Record<any, any> | null = swConfig[proxySetting];

		if (!swConfigSettings) {
			console.log('[Proxy] No swConfigSettings found, returning');
			return;
		}

		await this.registerSW(swConfigSettings);
		await this.setTransports();

		const activeIframe: HTMLIFrameElement | null =
			targetIframe ?? document.querySelector('iframe.active');
		if (!activeIframe) {
			console.log('[Proxy] No active iframe found');
			return;
		}

		// v2: prefer Frame.go for proper URL rewriting
		const navigated = await this.navigateFrame(
			activeIframe,
			this.search(url)
		);
		if (navigated) {
			console.log('[Proxy] Redirected via Frame.go');
			return;
		}

		// Fallback: manual prefix + codec encode (only if frame isn't registered)
		const prefix = this.resolveEncodingPrefix(
			swConfigSettings,
			activeIframe
		);
		const encodedUrl =
			prefix + swConfigSettings.config.codec.encode(this.search(url));
		console.log(
			'[Proxy] Frame.go unavailable, fallback redirect to:',
			encodedUrl
		);
		activeIframe.src = encodedUrl;
	}

	async convertURL(
		swConfig: Record<any, any>,
		proxySetting: string,
		url: string,
		targetIframe?: HTMLIFrameElement
	) {
		console.log(
			'[Proxy] convertURL() called with url:',
			url,
			'proxySetting:',
			proxySetting
		);
		let swConfigSettings: Record<any, any> | null = swConfig[proxySetting];

		if (!swConfigSettings) {
			console.log('[Proxy] No swConfigSettings, returning search url');
			return this.search(url);
		}

		await this.registerSW(swConfigSettings);
		await this.setTransports();

		const iframe =
			targetIframe ??
			(document.querySelector(
				'iframe.active'
			) as HTMLIFrameElement | null);

		const prefix = this.resolveEncodingPrefix(swConfigSettings, iframe);
		const encodedUrl =
			prefix + swConfigSettings.config.codec.encode(this.search(url));
		console.log(
			'[Proxy] Converted URL to:',
			encodedUrl,
			'(prefix:',
			prefix,
			')'
		);
		return encodedUrl;
	}

	async fetch(
		url: string,
		method?: string,
		body?: any,
		headers: [string, string][] = []
	): Promise<Response> {
		if (
			typeof url !== 'string' ||
			url.trim() === '' ||
			url === 'undefined' ||
			url === 'null'
		) {
			throw new Error('[Proxy.fetch] A valid URL string is required');
		}

		await this.setTransports();
		const transportState = await this.getTransports();
		const transport = transportState.controller;

		if (!transport) {
			throw new Error('[Proxy.fetch] Transport is unavailable');
		}

		if (!transport.ready && typeof transport.init === 'function') {
			await transport.init();
		}

		let remote: URL;
		try {
			remote = new URL(url);
		} catch {
			remote = new URL(this.search(url));
		}

		const requestMethod =
			typeof method === 'string' && method.trim() !== ''
				? method.toUpperCase()
				: body == null
					? 'GET'
					: 'POST';

		const readHeader = (rawHeaders: any, name: string): string | null => {
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
				for (const [key, value] of Object.entries(rawHeaders)) {
					if (key.toLowerCase() === needle) {
						return String(value);
					}
				}
			}

			return null;
		};

		const normalizeHeaderEntries = (
			rawHeaders: any
		): [string, string][] => {
			if (rawHeaders instanceof Headers) {
				return Array.from(rawHeaders.entries());
			}

			if (Array.isArray(rawHeaders)) {
				return rawHeaders
					.filter(
						(entry: any) =>
							Array.isArray(entry) &&
							entry.length >= 2 &&
							typeof entry[0] === 'string'
					)
					.map((entry: any) => [String(entry[0]), String(entry[1])]);
			}

			if (rawHeaders && typeof rawHeaders === 'object') {
				return Object.entries(rawHeaders).map(([key, value]) => [
					key,
					String(value)
				]);
			}

			return [];
		};

		const maxRedirects = 20;
		let response: any = null;

		for (
			let redirectCount = 0;
			redirectCount <= maxRedirects;
			redirectCount++
		) {
			response = await transport.request(
				remote,
				requestMethod,
				body ?? null,
				headers,
				undefined
			);

			const status = response?.status;
			if (![301, 302, 303, 307, 308].includes(status)) {
				break;
			}

			const location = readHeader(response?.headers, 'location');

			if (!location) {
				break;
			}

			remote = new URL(location, remote);
		}

		if (!response) {
			throw new Error(
				'[Proxy.fetch] No response returned from transport'
			);
		}

		const responseHeaders = new Headers();
		for (const [key, value] of normalizeHeaderEntries(response.headers)) {
			responseHeaders.append(key, value);
		}

		return new Response(response.body ?? null, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});
	}

	async eval(
		swConfig: Record<any, any>,
		frame: HTMLIFrameElement,
		code: string
	): Promise<boolean> {
		console.log('[Proxy.eval] Starting eval', {
			hasSrc: !!frame.src,
			src: frame.src,
			codeLength: code.length,
			codePreview: code.substring(0, 100)
		});

		if (!frame.src) {
			console.warn('[Proxy.eval] Cannot eval: frame has no src');
			return false;
		}

		let activeProxy: string | null = null;

		for (const [proxyName, proxyConfig] of Object.entries(swConfig)) {
			if (
				proxyConfig.config?.prefix &&
				frame.src.includes(proxyConfig.config.prefix)
			) {
				activeProxy = proxyName;
				console.log(
					'[Proxy.eval] Detected proxy:',
					proxyName,
					'with prefix:',
					proxyConfig.config.prefix
				);
				break;
			}
		}

		if (!activeProxy) {
			console.warn(
				'[Proxy.eval] Cannot eval: frame src does not match any proxy prefix',
				{
					frameSrc: frame.src,
					availablePrefixes: Object.entries(swConfig).map(
						([name, config]) => ({
							name,
							prefix: (config as any).config?.prefix
						})
					)
				}
			);
			return false;
		}

		try {
			/*if (activeProxy === "uv") {
        console.log("[Proxy.eval] Using UV eval");
        const uvEval = (frame.contentWindow as any)?.__uv$eval;
        if (!uvEval) {
          console.error(
            "[Proxy.eval] UV eval function not found on contentWindow",
          );
          return false;
        }
        uvEval(code);
        console.log("[Proxy.eval] UV eval succeeded");
        return true;
      } else*/ if (activeProxy === 'sj') {
				console.log('[Proxy.eval] Using Scramjet eval');
				const contentWindow = frame.contentWindow;
				if (!contentWindow) {
					console.error('[Proxy.eval] contentWindow is null');
					return false;
				}
				const scramjetWrap = (contentWindow as any).$scramjet$wrap;
				if (!scramjetWrap) {
					console.error(
						'[Proxy.eval] Scramjet $scramjet$wrap not found on contentWindow'
					);
					return false;
				}
				contentWindow.$scramjet$wrap(
					(contentWindow as any).eval.call(contentWindow, code)
				);
				console.log('[Proxy.eval] Scramjet eval succeeded');
				return true;
			} else if (new URL(frame.src).pathname.includes('/internal/')) {
				console.log('[Proxy.eval] Using direct eval for internal page');
				const directEval = (frame.contentWindow as any)?.eval;
				if (!directEval) {
					console.error(
						'[Proxy.eval] Direct eval function not found on contentWindow'
					);
					return false;
				}
				directEval(code);
				console.log('[Proxy.eval] Direct eval succeeded');
				return true;
			} else {
				console.warn(
					'[Proxy.eval] Cannot eval: unsupported proxy type for eval',
					{
						activeProxy,
						frameSrc: frame.src
					}
				);
				return false;
			}
		} catch (error) {
			console.error('[Proxy.eval] Eval failed with error:', error, {
				activeProxy,
				frameSrc: frame.src,
				code: code.substring(0, 200)
			});
			return false;
		}
	}

	private faviconCache = new Map<string, string>();
	private bookmarkManager: any = null;

	public setBookmarkManager(bookmarkManager: any): void {
		this.bookmarkManager = bookmarkManager;
	}

	async getFavicon(url: string) {
		try {
			const domain = new URL(url).hostname;
			if (!domain) {
				return null;
			}

			if (this.bookmarkManager) {
				const cachedFavicon =
					this.bookmarkManager.getCachedFavicon(url);
				if (cachedFavicon) {
					return cachedFavicon;
				}
			}

			if (this.faviconCache.has(domain)) {
				return this.faviconCache.get(domain) || null;
			}

			const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

			let retries = 3;
			while (retries > 0) {
				try {
					await this.setTransports();
					break;
				} catch (transportError) {
					retries--;
					if (retries === 0) throw transportError;
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}

			const response = await this.fetch(googleFaviconUrl, 'GET', null, [
				[
					'User-Agent',
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				]
			]);

			if (!response.ok) {
				return null;
			}

			const arrayBuffer = await response.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			let binary = '';
			for (let i = 0; i < bytes.byteLength; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			const base64 = btoa(binary);

			const dataUrl = `data:image/png;base64,${base64}`;

			this.faviconCache.set(domain, dataUrl);

			if (this.bookmarkManager) {
				await this.bookmarkManager.cacheFavicon(url, dataUrl);
			}

			return dataUrl;
		} catch (error) {
			console.warn('Failed to fetch favicon:', error);
			return null;
		}
	}

	async ping(
		server: string
	): Promise<{ online: boolean; ping: number | string }> {
		return this.network.wsPing(server);
	}

	async setRemoteProxyServer(server: string) {
		await this.network.setRemoteProxyServer(server);
	}

	async getRemoteProxyServer(): Promise<string> {
		return await this.network.getRemoteProxyServer();
	}

	async disableReflux() {
		await this.settings.setItem('RefluxStatus', 'false');
	}

	async enableReflux() {
		await this.settings.setItem('RefluxStatus', 'true');
	}

	async getRefluxStatus(): Promise<boolean> {
		const status = await this.settings.getItem('RefluxStatus');
		return status !== 'false';
	}

	async getAuthUrl(): Promise<string> {
		try {
			const productionAuthUrl = await this.settings.getItem(
				'production_auth_url'
			);
			if (productionAuthUrl && typeof productionAuthUrl === 'string') {
				return productionAuthUrl;
			}
			return (
				(location.protocol === 'https:' ? 'https://' : 'http://') +
				location.host +
				resolvePath('auth')
			);
		} catch (error) {
			console.error('[Proxy] Error determining auth URL:', error);
			return 'https://demoplussrv.night-x.com/auth';
		}
	}

	async checkAuthentication(): Promise<boolean> {
		try {
			const basePlusPath = resolvePath('plus');
			const fileName = 'index.mjs';
			const module = await import(`${basePlusPath}/${fileName}`);
			const PlusClient = module.default;
			const client = new PlusClient();
			const sessionToken = await client.getSessionToken();
			return sessionToken !== null;
		} catch (error) {
			console.error('[Proxy] Error checking authentication:', error);
			return false;
		}
	}
}

export { Proxy };
