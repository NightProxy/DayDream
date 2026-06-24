import { describe, it, expect } from 'vitest';
import { NyxBridge } from '../../src/apis/nyxBridge';

describe('NyxBridge', () => {
	it('init wires handshake + channel', async () => {
		const bridge = new NyxBridge({
			scriptInjectionRegistry: { register: () => {}, unregister: () => false },
			tabs: {} as any,
			proxy: {} as any,
			settings: { getItem: async () => null } as any,
		});
		await bridge.init();
		expect(bridge.isInitialized).toBe(true);
		const internals = bridge._internals();
		expect(internals.handshake).toBeDefined();
		expect(internals.channel).toBeDefined();
		expect(internals.hostMarker.length).toBeGreaterThan(0);
	});
});
