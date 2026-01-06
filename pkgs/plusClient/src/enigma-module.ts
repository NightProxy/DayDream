import type { EnigmaModule, ModuleWebSocketContext, ModuleWebSocketHandlers, ModuleWebSocketControls } from "@nightnetwork/enigma";
import localforage from "localforage";

export const MODULE_ID = 'com.nightnetwork.plus.auth';

const sessionStore = localforage.createInstance({
	name: "NightPlus",
	storeName: "session"
});

function encodeAuthProtocol(data: Record<string, string>): string {
	return btoa(JSON.stringify(data));
}

export function createPlusAuthModule() {
	const module: EnigmaModule = {
		id: MODULE_ID,
		name: 'Night+ Auth',
		version: '1.0.0',
		priority: 100,

		capabilities: {
			requestInterception: false,
			responseInterception: false,
			websocketInterception: true,
			protocolModification: true
		},

		hooks: {
			onModuleInit: () => {
				console.debug('[Night+ Auth] Module initialized');
			},

			onWebSocketConnect: (
				ctx: ModuleWebSocketContext,
				handlers: ModuleWebSocketHandlers,
				next
			): ModuleWebSocketControls | void => {
				sessionStore.getItem<string>('token').then(sessionToken => {
					if (!sessionToken) {
						console.debug('[Night+ Auth] No session token found');
						return;
					}

					const authData: Record<string, string> = {
						'Night-Auth': sessionToken
					};

					const authProtocol = encodeAuthProtocol(authData);

					const modifiedProtocols = [...ctx.protocols, authProtocol];

					console.debug('[Night+ Auth] Injected session token via protocol');

					return next({
						protocols: modifiedProtocols
					});
				}).catch(err => {
					console.error('[Night+ Auth] Failed to read session token:', err);
				});

				return next();
			},

			provideMeta: () => ({
				name: 'Night+ Authentication',
				description: 'Injects Night-Auth session tokens into WebSocket connections via protocol',
				version: '1.0.0',
				enabled: true
			})
		}
	};

	return module;
}

export default createPlusAuthModule;
