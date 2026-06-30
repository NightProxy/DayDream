
import { register } from './index';

register('auth.getPlusToken', async () => {
	const { getAccessToken } = await import('../../nightplus');
	const token = await getAccessToken();
	if (!token) return null;
	return { token, expiresAt: 0 };
});

register('auth.getUser', async () => {
	const { nightPlusStore } = await import('../../nightplus');
	const profile = await nightPlusStore.getItem('profile');
	return profile ?? null;
});

/**
 * Embedded app (NyxAI) signed in through its own modal and is handing
 * the resulting access token up to DDX. Mirrors the side-effects of
 * newtab's setupNightPlusButton onSuccess: store the token, mint a
 * plus-client session, refresh cached subscription/server data.
 *
 * Side-effects after this resolves are best-effort: a failure in
 * plus-client.authenticate or dumpNightPlusData does NOT fail the
 * call, since the access token itself is the gating credential and
 * the rest is recoverable on next access.
 */
register('auth.setToken', async (_ctx, args) => {
	const token = (args as { token?: unknown })?.token;
	if (typeof token !== 'string' || token.length === 0) {
		throw new Error('invalid_argument: token must be a non-empty string');
	}
	const { setAccessToken, dumpNightPlusData } = await import('../../nightplus');
	await setAccessToken(token);

	try {
		const basePlusPath = (window as any).basePath
			? `${(window as any).basePath}/plus`
			: '/plus';
		const mod = await import(/* @vite-ignore */ `${basePlusPath}/index.mjs`);
		const PlusClient = mod.default;
		const client = new PlusClient();
		const authUrl = await (window as any).proxy?.getAuthUrl?.();
		if (authUrl) await client.authenticate(token, authUrl);
	} catch (e) {
		console.warn('[nyxBridge:auth.setToken] plus-client.authenticate failed (continuing):', e);
	}
	try {
		await dumpNightPlusData();
	} catch (e) {
		console.warn('[nyxBridge:auth.setToken] dumpNightPlusData failed (continuing):', e);
	}
	return { ok: true };
});

/**
 * Embedded app is signing out and wants DDX to forget the shared
 * session. Clears access token, plus-client session token, and the
 * cached subscription/server data.
 */
register('auth.clearToken', async () => {
	const { clearAccessToken, clearSessionToken, clearNightPlusCache } =
		await import('../../nightplus');
	await clearAccessToken();
	await clearSessionToken();
	try {
		await clearNightPlusCache();
	} catch (e) {
		console.warn('[nyxBridge:auth.clearToken] clearNightPlusCache failed (continuing):', e);
	}
	return { ok: true };
});
