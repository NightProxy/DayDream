/**
 * Minimal in-memory implementation of the SettingsAPI surface that
 * SearchEngineRegistry depends on (`getItem`, `setItem`, `removeItem`).
 *
 * Shared between test files so that any drift in the registry's expected
 * settings interface is caught in one place rather than diverging between
 * mocks. The underscore-prefixed helpers (`_get`, `_set`) are escape hatches
 * for tests that need to seed corrupt or pre-existing values directly.
 */
export class FakeSettings {
	private store = new Map<string, unknown>();

	async getItem<T = unknown>(key: string): Promise<T | null> {
		return (this.store.has(key) ? this.store.get(key) : null) as T | null;
	}

	async setItem(key: string, value: unknown): Promise<void> {
		this.store.set(key, value);
	}

	async removeItem(key: string): Promise<void> {
		this.store.delete(key);
	}

	_set(key: string, value: unknown): void {
		this.store.set(key, value);
	}

	_get(key: string): unknown {
		return this.store.get(key);
	}
}
