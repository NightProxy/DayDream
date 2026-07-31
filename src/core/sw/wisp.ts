interface WispSettings {
	getItem<T>(key: string): Promise<T | null>;
	setItem<T>(key: string, value: T): Promise<T>;
}

class WispManager {
	private readonly settingsStore: WispSettings;
	private wispReady = false;

	constructor(settingsStore: WispSettings) {
		this.settingsStore = settingsStore;
	}

	generateRandomString(): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		const length = 16 + Math.floor(Math.random() * 17);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars[Math.floor(Math.random() * chars.length)];
		}
		return result;
	}

	checkServerWisp(): Promise<boolean> {
		const proto = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${proto}//${self.location.host}/wisp/`;

		return new Promise(resolve => {
			const ws = new WebSocket(url);

			const timeout = setTimeout(() => {
				ws.close();
				resolve(false);
			}, 5000);

			ws.addEventListener('open', () => {
				clearTimeout(timeout);
				console.log(
					`[DDXWorker] Server /wisp/ endpoint found at ${url}`
				);
				ws.close();
				resolve(true);
			});

			ws.addEventListener('error', () => {
				clearTimeout(timeout);
				console.log('[DDXWorker] Server /wisp/ endpoint not available');
				resolve(false);
			});
		});
	}

	async ensureWisp(): Promise<boolean> {
		if (this.wispReady) return true;

		try {
			// Terbium TAPP: src/terbium/boot.ts posts `ddx:wisp-override`
			// to the SW. The message handler in sw/index.ts caches the URL
			// on `self.__ddxOverrideWisp`. Honor it before consulting
			// settings — Terbium's Wisp takes precedence.
			const override = (self as any).__ddxOverrideWisp;
			if (typeof override === 'string' && override.length > 0) {
				await this.settingsStore.setItem('wisp', override);
				console.log(
					`[DDXWorker] Using Terbium-provided WISP: ${override}`
				);
				this.wispReady = true;
				return true;
			}

			let wispUrl = await this.settingsStore.getItem<string>('wisp');
			console.log(`[DDXWorker] ensureWisp: current value = ${wispUrl}`);

			if (!wispUrl) {
				const hasServerWisp = await this.checkServerWisp();

				if (hasServerWisp) {
					const proto =
						self.location.protocol === 'https:' ? 'wss:' : 'ws:';
					wispUrl = `${proto}//${self.location.host}/wisp/`;
					await this.settingsStore.setItem('wisp', wispUrl);
					console.log(
						`[DDXWorker] Using server-provided WISP endpoint: ${wispUrl}`
					);
				} else {
					const subdomain = this.generateRandomString();
					wispUrl = `wss://${subdomain}.nightwisp.me.cdn.cloudflare.net/wisp/`;
					await this.settingsStore.setItem('wisp', wispUrl);
					console.log(
						`[DDXWorker] Generated WISP server: ${wispUrl}`
					);
				}
			}

			this.wispReady = true;
			return true;
		} catch (err) {
			console.error('[DDXWorker] ensureWisp failed:', err);
			return false;
		}
	}

	/**
	 * Synchronously synthesises a fallback WISP URL without touching
	 * settings or the network. Used by the shared transport module as a
	 * `defaultWisp` provider when the `wisp` setting is missing — this
	 * avoids re-running the full `ensureWisp` probe on every fetch.
	 *
	 * Prefers the same-origin `/wisp/` endpoint (matches the path the
	 * page server serves when it has wisp built in); falls back to a
	 * Cloudflare-fronted random subdomain on `nightwisp.me`.
	 */
	computeWispUrl(): string {
		const proto = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
		return `${proto}//${self.location.host}/wisp/`;
	}
}

export { WispManager };
