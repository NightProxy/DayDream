
export function dispatchEventToFrame(
	target: Window | null | undefined,
	eventType: string,
	detail: unknown,
): boolean {
	if (!target) return false;
	const isScramjetProxied =
		typeof window !== 'undefined' &&
		typeof (window as { $scramjet?: unknown }).$scramjet !== 'undefined';
	if (!isScramjetProxied) {
		try {
			target.postMessage({ [eventType]: detail }, '*');
			return true;
		} catch (e) {
			console.warn(`[nyxBridge] ${eventType} postMessage failed:`, e);
			return false;
		}
	}
	try {
		target.dispatchEvent(new CustomEvent(eventType, { detail }));
		return true;
	} catch (e) {
		console.warn(`[nyxBridge] ${eventType} dispatchEvent failed:`, e);
		return false;
	}
}
