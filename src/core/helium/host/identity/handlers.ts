
import type { ExtensionContext } from '../../extfs/types';

function notSupported(method: string): never {
	throw new Error(`chrome.identity.${method} is not supported`);
}

export class IdentityHandlers {
	getAuthToken = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('getAuthToken');

	launchWebAuthFlow = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<never> => notSupported('launchWebAuthFlow');

	getProfileUserInfo = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<{ email: string; id: string }> => ({ email: '', id: '' });

	getAccounts = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<unknown[]> => [];

	getRedirectURL = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<string> => {
		const raw = args[0];
		const path = typeof raw === 'string' ? raw.replace(/^\/+/, '') : '';
		return `https://${ctx.id}.ddx/redirect/${path}`;
	};

	removeCachedAuthToken = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// No-op: no token cache exists.
	};

	clearAllCachedAuthTokens = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<void> => {
		// No-op: no token cache exists.
	};
}
