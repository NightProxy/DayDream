export function defineLazyGlobal<
	T extends object,
	K extends PropertyKey,
	V,
>(target: T, key: K, factory: () => V): void {
	let initialized = false;
	let value: V;

	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		get() {
			if (!initialized) {
				value = factory();
				initialized = true;
			}
			return value;
		},
		set(next: V) {
			value = next;
			initialized = true;
		},
	});
}
