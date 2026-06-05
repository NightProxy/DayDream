/**
 * Per-frame devtools agent. Runs inside a Scramjet-proxied window.
 * Wires chobitsu to the host via the Scramjet postMessage envelope.
 *
 * Boot model:
 *   - Loaded as `<script src=".../assets/devtools-agent.js">` by the
 *     hookInstaller. The bundle calls bootAgent() at module top-level.
 *   - Generates / restores a frameId via sessionStorage so it survives
 *     in-frame navigations.
 *   - Announces itself with frame-ready, then bridges chobitsu both
 *     directions.
 *
 * Robustness: every cross-window call is wrapped in try/catch. We must
 * never throw into the proxied page.
 */

import chobitsu from 'chobitsu';

const SS_KEY = 'ddx:devtools:frameId';
const DEVTOOLS_HOST_TAG = '__ddxDevtoolsMsg';

function getOrCreateFrameId(): string {
	try {
		const existing = sessionStorage.getItem(SS_KEY);
		if (existing) return existing;
	} catch {
		// sessionStorage may be blocked.
	}
	const fresh =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	try {
		sessionStorage.setItem(SS_KEY, fresh);
	} catch {
		// best effort
	}
	return fresh;
}

function readParentFrameId(): string | null {
	try {
		return window.parent.sessionStorage.getItem(SS_KEY);
	} catch {
		return null;
	}
}

function postToHost(message: Record<string, unknown>): void {
	try {
		const env = {
			$scramjet$messagetype: 'window',
			$scramjet$origin: location.origin,
			$scramjet$data: {
				...message,
				[DEVTOOLS_HOST_TAG]: true,
			},
		};
		window.parent.postMessage(env, '*');
	} catch {
		// best effort
	}
}

let booted = false;

export function bootAgent(): void {
	if (booted) return;
	booted = true;

	console.log('[ddx-devtools-agent] booting in', location.href);
	const frameId = getOrCreateFrameId();
	const parentFrameId = readParentFrameId();
	const isTop = parentFrameId === null || parentFrameId === frameId;
	const url = (() => {
		try {
			return location.href;
		} catch {
			return '';
		}
	})();
	const title = (() => {
		try {
			return document.title || url;
		} catch {
			return url;
		}
	})();

	chobitsu.setOnMessage((payload: string) => {
		postToHost({ kind: 'cdp-out', frameId, payload });
	});

	// Host -> agent CDP transport.
	//
	// We do NOT use postMessage for this direction. Scramjet proxies the
	// proxied window's own-property `postMessage` with a wrapper that
	// reads the caller's realm SCRAMJETCLIENT, which doesn't exist when
	// the host (unproxied) is the caller — every host->agent post would
	// crash inside scramjet's proxy. There is no
	// `Window.prototype.postMessage` to bypass it with (postMessage is
	// an own property of each Window instance, not on the prototype).
	//
	// Instead, expose a direct function on this proxied window. The host
	// invokes it cross-realm; the body executes here with normal access
	// to chobitsu. Scramjet's hooks cover specific DOM globals, not
	// arbitrary user-defined window properties, so this slot survives.
	const receive = (incomingFrameId: string, payload: string) => {
		if (incomingFrameId !== frameId) return;
		if (typeof payload !== 'string') return;
		try {
			chobitsu.sendRawMessage(payload);
		} catch (err) {
			postToHost({
				kind: 'agent-error',
				frameId,
				message: String((err as Error)?.message ?? err),
			});
		}
	};
	try {
		Object.defineProperty(window, '__ddxDevtoolsReceive', {
			value: receive,
			writable: true,
			configurable: true,
			enumerable: false,
		});
	} catch {
		// Some hardened pages may freeze window. Best effort.
		try {
			(window as unknown as Record<string, unknown>).__ddxDevtoolsReceive =
				receive;
		} catch {
			// give up; host will see undefined and drop messages
		}
	}

	try {
		window.addEventListener('unload', () => {
			postToHost({ kind: 'frame-gone', frameId });
		});
	} catch {
		// best effort
	}

	console.log('[ddx-devtools-agent] posting frame-ready', { frameId, isTop, url });
	postToHost({
		kind: 'frame-ready',
		frameId,
		parentFrameId: isTop ? null : parentFrameId,
		url,
		title,
	});
}

bootAgent();
