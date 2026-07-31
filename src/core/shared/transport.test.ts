import { describe, expect, it } from 'vitest';
import { resolveTransportConfig } from './transport';

describe('resolveTransportConfig', () => {
	it('falls back to libcurl for a persisted nova selection', async () => {
		const settings = {
			getItem: async <T>(key: string): Promise<T | null> =>
				(key === 'transports' ? ('nova' as T) : null)
		};

		await expect(
			resolveTransportConfig(settings, () => 'wss://example.test/wisp/')
		).resolves.toEqual({ kind: 'libcurl', wisp: 'wss://example.test/wisp/' });
	});
});
