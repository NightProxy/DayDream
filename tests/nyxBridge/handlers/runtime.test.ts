import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/runtime';

describe('runtime', () => {
	it('getURL resolves against origin', async () => {
		expect(await HANDLERS['runtime.getURL']!({} as any, '/foo')).toContain('/foo');
	});
	it('getManifest has version', async () => {
		expect(((await HANDLERS['runtime.getManifest']!({} as any, undefined)) as any).version).toBe('1.0');
	});
});
