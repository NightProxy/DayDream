import { describe, it, expect, vi } from 'vitest';
import { defineLazyGlobal } from '../src/boot/lazyGlobals';

describe('defineLazyGlobal', () => {
	it('defers factory execution until the property is first read', () => {
		const target: Record<string, unknown> = {};
		const factory = vi.fn(() => ({ ready: true }));

		defineLazyGlobal(target, 'service', factory);
		expect(factory).not.toHaveBeenCalled();

		expect(target.service).toEqual({ ready: true });
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('reuses the same instance across repeated reads', () => {
		const target: Record<string, unknown> = {};
		const service = { ready: true };
		const factory = vi.fn(() => service);

		defineLazyGlobal(target, 'service', factory);

		expect(target.service).toBe(service);
		expect(target.service).toBe(service);
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('allows explicit assignment to override the lazy value', () => {
		const target: Record<string, unknown> = {};
		const factory = vi.fn(() => ({ ready: true }));
		const override = { ready: false };

		defineLazyGlobal(target, 'service', factory);
		target.service = override;

		expect(target.service).toBe(override);
		expect(factory).not.toHaveBeenCalled();
	});
});
