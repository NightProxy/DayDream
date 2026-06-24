import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/windows';

const ctxNoTabs: any = { tabResolver: { all: () => [] } };

describe('windows', () => {
	it('getCurrent returns window 1', async () => {
		const w = await HANDLERS['windows.getCurrent']!(ctxNoTabs, undefined);
		expect((w as any).id).toBe(1);
	});
	it('getAll returns array of length 1', async () => {
		const arr = await HANDLERS['windows.getAll']!(ctxNoTabs, undefined) as any[];
		expect(arr.length).toBe(1);
	});
	it('create rejects', async () => {
		await expect(HANDLERS['windows.create']!(ctxNoTabs, {})).rejects.toMatchObject({ code: 'not_supported' });
	});
});
