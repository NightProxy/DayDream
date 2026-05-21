/**
 * Cross-frame events bridge for scramjet-proxied iframes.
 *
 * Why this exists
 * ---------------
 * `EventSystem.emit` in `src/apis/events.ts` broadcasts each event to every
 * iframe via `iframe.contentWindow.postMessage(message, "*")`. For our
 * internal `ddx://` pages (settings, newtab, error) this works directly —
 * they aren't routed through scramjet's service worker.
 *
 * For scramjet-proxied iframes the situation is different: scramjet has
 * trapped `Window.prototype.postMessage` inside the proxied window. Its
 * wrapper expects every outgoing message to be re-wrapped in the envelope
 * `{$scramjet$messagetype, $scramjet$origin, $scramjet$data}`. When the
 * host calls `iframe.contentWindow.postMessage(raw)`, the wrapper tries to
 * read `e.url.origin` from its own (scramjet-internal) client context.
 * That context is host-side and has no URL, so the wrapper crashes with
 * `Cannot read properties of undefined (reading 'url')`.
 *
 * Even if the wrapper succeeded, the receiving proxied page would see the
 * scramjet envelope, not our raw payload, so any in-iframe receiver would
 * never match on `event.data.eventName`.
 *
 * This module solves both halves of the problem:
 *
 *   1. `sendToProxiedFrame(iframe, message)` — wrap our payload in the
 *      scramjet envelope before posting, satisfying the wrapper contract
 *      and ensuring the message arrives intact on the proxied side.
 *
 *   2. `installEventsBridge(controller)` — tap scramjet's per-frame
 *      `frameInit.post` hook. For every newly initialised proxied frame,
 *      attach a host-context `message` listener on its proxied window that
 *      unwraps our payload and re-dispatches it as a `CustomEvent` on the
 *      proxied document. Proxied pages opt in by doing
 *      `document.addEventListener('ddx:foo', ...)` — the same API surface
 *      our internal pages already use.
 *
 * Public API stays inside `EventSystem` (`eventsAPI.emit/addEventListener`).
 * Callers don't need to know whether their target is proxied or not.
 */

const HOST_SENDER_TAG = '__ddxHostBridge';

/**
 * Build the scramjet-envelope-wrapped form of one of our event payloads.
 * The proxied window's scramjet `postMessage` wrapper unpacks any message
 * shaped this way and delivers `$scramjet$data` as the visible `event.data`.
 */
function wrapForProxiedFrame(message: unknown): Record<string, unknown> {
	return {
		$scramjet$messagetype: 'window',
		$scramjet$origin: location.origin,
		$scramjet$data: {
			...((typeof message === 'object' && message !== null
				? (message as Record<string, unknown>)
				: { value: message }) as Record<string, unknown>),
			[HOST_SENDER_TAG]: true
		}
	};
}

/**
 * Membership test: is this iframe element registered as a scramjet
 * proxy frame? Read-only against `controller.frames`; safe to call
 * with a null/undefined controller (returns false).
 */
export function isProxiedIframe(
	iframe: HTMLIFrameElement,
	controller: any
): boolean {
	if (!controller || !Array.isArray(controller.frames)) return false;
	return controller.frames.some((f: any) => f?.element === iframe);
}

/**
 * Safe postMessage to one iframe. Picks the right delivery path based on
 * whether the iframe is scramjet-proxied. All errors are swallowed — a
 * single misbehaving iframe (mid-navigation, detached, cross-origin
 * reflinkage) must not break the rest of the broadcast.
 */
export function postEventToIframe(
	iframe: HTMLIFrameElement,
	message: unknown,
	controller: any
): void {
	const target = iframe.contentWindow;
	if (!target) return;

	try {
		if (isProxiedIframe(iframe, controller)) {
			target.postMessage(wrapForProxiedFrame(message), '*');
		} else {
			target.postMessage(message, '*');
		}
	} catch (error) {
		// Best-effort delivery. Log once for visibility but do not throw.
		console.warn(
			'[eventsBridge] postMessage to iframe failed (continuing):',
			error
		);
	}
}

/**
 * Receiver script installed inside every proxied window via the
 * `frameInit.post` hook. Listens for our host-tagged payloads, strips
 * the sender tag, and re-emits as a `CustomEvent` on the proxied
 * document. Proxied pages consume with `document.addEventListener`.
 *
 * Runs from the host context but bound to the proxied window — exactly
 * the right scope for receiving messages targeted at that window.
 */
function attachProxiedReceiver(proxiedWindow: Window): void {
	const handler = (event: MessageEvent) => {
		const data = event?.data as Record<string, unknown> | null | undefined;
		if (!data || typeof data !== 'object') return;
		if (!data[HOST_SENDER_TAG]) return;

		const eventName = data['eventName'];
		if (typeof eventName !== 'string' || !eventName) return;

		const payload = data['data'];

		try {
			const doc = proxiedWindow.document;
			if (!doc) return;
			doc.dispatchEvent(
				new CustomEvent(eventName, { detail: payload ?? {} })
			);
		} catch (error) {
			// Proxied window may have been torn down between hook and dispatch.
			console.warn(
				'[eventsBridge] receiver dispatch failed (continuing):',
				error
			);
		}
	};

	try {
		proxiedWindow.addEventListener('message', handler);
	} catch (error) {
		console.warn(
			'[eventsBridge] failed to attach proxied receiver:',
			error
		);
	}
}

/**
 * Install the per-frame init hook that wires the receiver into every
 * scramjet-proxied frame as it boots. Call once after the scramjet
 * controller is ready. Idempotent — re-invocation is a no-op.
 *
 * We accept `controller` as `any` because the scramjet-controller types
 * pin `hooks.frameInit` to scramjet's internal `TapInstance` shape;
 * accessing it positionally avoids leaking that surface into our code.
 */
let installed = false;
export function installEventsBridge(controller: any): void {
	if (installed) return;
	if (!controller) {
		console.warn(
			'[eventsBridge] install called with no controller; skipping'
		);
		return;
	}

	const scramjet = (window as any).$scramjet;
	if (!scramjet?.Plugin) {
		console.warn(
			'[eventsBridge] $scramjet.Plugin unavailable; receiver not installed'
		);
		return;
	}

	// We need to tap frameInit.post on EVERY frame the controller creates,
	// including frames that pre-existed this call. The cleanest scramjet
	// pattern is a Plugin tapping the per-frame hook from inside a
	// controller-level callback, but the controller doesn't expose a
	// "frame created" event. Pragmatic alternative: wrap createFrame so
	// every new frame gets the hook installed at creation time, and
	// install on any already-existing frames once.

	const installOnFrame = (frame: any) => {
		try {
			const postHook = frame?.hooks?.frameInit?.post;
			if (!postHook) return;
			const plugin = new scramjet.Plugin('ddx-events-bridge');
			plugin.tap(postHook, (context: any) => {
				const win = context?.window as Window | undefined;
				if (win) attachProxiedReceiver(win);
			});
		} catch (error) {
			console.warn(
				'[eventsBridge] failed to tap frameInit on frame:',
				error
			);
		}
	};

	if (Array.isArray(controller.frames)) {
		for (const frame of controller.frames) installOnFrame(frame);
	}

	const originalCreateFrame = controller.createFrame?.bind(controller);
	if (typeof originalCreateFrame === 'function') {
		controller.createFrame = (...args: any[]) => {
			const frame = originalCreateFrame(...args);
			if (frame) installOnFrame(frame);
			return frame;
		};
	}

	installed = true;
}
