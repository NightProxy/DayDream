import localforage from "localforage";
import { createPlusAuthModule } from './enigma-module';

export class PlusClient {
	private sessionStore: LocalForage;

	constructor() {
		this.sessionStore = localforage.createInstance({
			name: "NightPlus",
			storeName: "session"
		});
	}

	async setSessionToken(token: string): Promise<void> {
		await this.sessionStore.setItem('token', token);
	}

	async getSessionToken(): Promise<string | null> {
		return await this.sessionStore.getItem<string>('token');
	}

	async clearSessionToken(): Promise<void> {
		await this.sessionStore.removeItem('token');
	}

	async authenticate(accessToken: string, authUrl = '/auth'): Promise<string> {
		const response = await fetch(authUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ access_token: accessToken })
		});

		if (!response.ok) {
			throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const sessionToken = data.session_token;

		if (!sessionToken) {
			throw new Error('No session token in response');
		}

		await this.setSessionToken(sessionToken);
		return sessionToken;
	}

	async validateSession(validateUrl = '/validate'): Promise<boolean> {
		const token = await this.getSessionToken();
		if (!token) return false;

		try {
			const response = await fetch(validateUrl, {
				headers: {
					'Night-Auth': token
				}
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	createEnigmaModule() {
		return createPlusAuthModule();
	}
}

export default PlusClient;
export { createPlusAuthModule };
