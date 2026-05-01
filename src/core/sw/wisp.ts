import { SettingsAPI } from '@apis/settings';

class WispManager {
	private readonly settingsStore: SettingsAPI;
	private wispReady = false;

	constructor(settingsStore: SettingsAPI) {
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
}

export { WispManager };
