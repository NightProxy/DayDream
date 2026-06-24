// src/apis/nyxBridge/frameDispatch.ts
//
// Cross-realm CustomEvent delivery into a scramjet-proxied iframe.
//
// Why this exists: scramjet wraps `Window.prototype.postMessage` in the
// proxied realm to attach a `$scramjet$messagetype` envelope. The
// wrapper reads `args[0].constructor.constructor("return globalThis")
// ()[POLLUTANT].url.origin`. When HOST code calls
// `proxiedWindow.postMessage(...)` (from outside the proxied realm),
// POLLUTANT is undefined and the wrapper crashes with
// "Cannot read properties of undefined (reading 'url')".
//
// Workaround: bypass postMessage entirely. dispatchEvent fires straight
// on the target Window — same realm conventions don't apply because we
// hold a direct reference, not a structured-clone post.
//
// Used by:
//   - NyxChannel.replyTransport (host → guest RPC replies; event name
//     `__nyx_res`)
//   - NyxBridge.queuePrefill (host → guest "start a chat with this
//     prompt"; event name `__nyx_prefill`)

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
		// Tests / non-proxied callers: regular postMessage works fine.
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
