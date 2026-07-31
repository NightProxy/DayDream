import { describe, it, expect, vi } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/search';

describe('search.query', () => {
	it('NEW_TAB disposition calls tabs.createTab', async () => {
		const createTab = vi.fn(async () => 'tab-1');
		const ctx: any = { tabs: { createTab }, protocols: null };
		await HANDLERS['search.query']!(ctx, { text: 'cats', disposition: 'NEW_TAB' });
		expect(createTab).toHaveBeenCalledWith('cats');
	});

	it('default disposition calls protocols.navigate', async () => {
		const navigate = vi.fn(async () => undefined);
		const ctx: any = { tabs: null, protocols: { navigate } };
		await HANDLERS['search.query']!(ctx, { text: 'cats' });
		expect(navigate).toHaveBeenCalledWith('cats');
	});
});
