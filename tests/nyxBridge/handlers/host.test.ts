import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/host';

describe('host', () => {
	it('version returns protocolVersion + hostVersion', async () => {
		const v = await HANDLERS['host.version']!({} as any, undefined) as any;
		expect(v.protocolVersion).toBe('1.0');
		expect(typeof v.hostVersion).toBe('string');
	});
	it('capabilities groups methods by namespace', async () => {
		const c = await HANDLERS['host.capabilities']!({} as any, undefined) as any;
		expect(c.namespaces.tabs).toContain('query');
		expect(c.namespaces.dom).toContain('readPage');
	});
});
