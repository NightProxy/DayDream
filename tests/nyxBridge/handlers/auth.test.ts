import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/auth';

describe('auth', () => {
	it('getPlusToken handler is registered', () => {
		expect(typeof HANDLERS['auth.getPlusToken']).toBe('function');
	});
	it('getUser handler is registered', () => {
		expect(typeof HANDLERS['auth.getUser']).toBe('function');
	});
	// We don't invoke the handlers because they import nightplus, which
	// transitively pulls SettingsAPI/NightFS/OPFS. The registry guard
	// (Task 8.8) and the manual smoke test (Task 9.1) cover behavior.
});
