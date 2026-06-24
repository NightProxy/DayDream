import { describe, it, expect } from 'vitest';
import { METHOD_REGISTRY } from '../../src/apis/nyxBridge/api';
import { HANDLERS } from '../../src/apis/nyxBridge/handlers';
import '../../src/apis/nyxBridge/handlers/_loadAll';

describe('METHOD_REGISTRY completeness', () => {
	it('every method has a handler', () => {
		const missing = METHOD_REGISTRY.filter((m) => !(m in HANDLERS));
		expect(missing).toEqual([]);
	});

	it('no extra handlers exist', () => {
		const extra = Object.keys(HANDLERS).filter(
			(k) => !(METHOD_REGISTRY as readonly string[]).includes(k),
		);
		expect(extra).toEqual([]);
	});
});
