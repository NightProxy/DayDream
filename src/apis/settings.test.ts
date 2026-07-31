import { describe, expect, it, vi } from 'vitest';

const resilientMocks = vi.hoisted(() => ({
	instances: 0,
	getItem: vi.fn().mockResolvedValue('shared-dark'),
	setItem: vi.fn(),
	mergeItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	keys: vi.fn().mockResolvedValue(['theme'])
}));

vi.mock('./data/resilientStorage', () => ({
	ResilientStorage: class {
		readonly getItem = resilientMocks.getItem;
		readonly setItem = resilientMocks.setItem;
		readonly mergeItem = resilientMocks.mergeItem;
		readonly removeItem = resilientMocks.removeItem;
		readonly clear = resilientMocks.clear;
		readonly keys = resilientMocks.keys;

		constructor() {
			resilientMocks.instances += 1;
		}
	}
}));

import { SettingsAPI } from './settings';
import type { SettingsStorage } from './settings';

describe('SettingsAPI', () => {
	it('delegates operations with its configured paths', async () => {
		const storage: SettingsStorage = {
			getItem: vi.fn().mockResolvedValue('dark'),
			setItem: vi.fn().mockResolvedValue('light'),
			mergeItem: vi.fn().mockResolvedValue({ theme: 'light' }),
			removeItem: vi.fn().mockResolvedValue(undefined),
			clear: vi.fn().mockResolvedValue(undefined),
			keys: vi.fn().mockResolvedValue(['theme'])
		};
		const settings = new SettingsAPI(
			'/profiles/alice/settings.json',
			'/profiles/alice',
			storage
		);

		await expect(settings.getItem('theme')).resolves.toBe('dark');
		await expect(settings.setItem('theme', 'light')).resolves.toBe('light');
		await settings.removeItem('theme');
		await expect(settings.keys()).resolves.toEqual(['theme']);
		await settings.clear();

		expect(storage.getItem).toHaveBeenCalledWith(
			'/profiles/alice/settings.json',
			'/profiles/alice',
			'theme'
		);
		expect(storage.setItem).toHaveBeenCalledWith(
			'/profiles/alice/settings.json',
			'/profiles/alice',
			'theme',
			'light'
		);
		expect(storage.removeItem).toHaveBeenCalledWith(
			'/profiles/alice/settings.json',
			'/profiles/alice',
			'theme'
		);
		expect(storage.keys).toHaveBeenCalledWith(
			'/profiles/alice/settings.json',
			'/profiles/alice'
		);
		expect(storage.clear).toHaveBeenCalledTimes(1);
	});

	it('lazily reuses one resilient storage instance by default', async () => {
		const first = new SettingsAPI();
		const second = new SettingsAPI('/data/other.json', '/data');

		expect(resilientMocks.instances).toBe(0);
		await expect(first.getItem('theme')).resolves.toBe('shared-dark');
		await expect(second.keys()).resolves.toEqual(['theme']);

		expect(resilientMocks.instances).toBe(1);
		expect(resilientMocks.getItem).toHaveBeenCalledWith(
			'/data/settings.json',
			'/data',
			'theme'
		);
		expect(resilientMocks.keys).toHaveBeenCalledWith(
			'/data/other.json',
			'/data'
		);
	});
});
