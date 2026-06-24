import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/bookmarks';

describe('bookmarks', () => {
	it('getTree returns empty array', async () => {
		expect(await HANDLERS['bookmarks.getTree']!({} as any, undefined)).toEqual([]);
	});
	it('create rejects', async () => {
		await expect(HANDLERS['bookmarks.create']!({} as any, { title: 'x' })).rejects.toMatchObject({ code: 'not_supported' });
	});
});
