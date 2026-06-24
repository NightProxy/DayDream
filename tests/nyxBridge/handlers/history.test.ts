import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/history';

describe('history', () => {
	it('search returns empty array', async () => {
		expect(await HANDLERS['history.search']!({} as any, { text: '' })).toEqual([]);
	});
	it('addUrl rejects', async () => {
		await expect(HANDLERS['history.addUrl']!({} as any, { url: 'x' })).rejects.toMatchObject({ code: 'not_supported' });
	});
});
