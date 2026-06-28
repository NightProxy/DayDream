/**
 * Worker-flavoured devtools agent.
 *
 * Runs inside a Neutron content-script worker. The worker has no DOM —
 * `globalThis.window` / `globalThis.document` are synthetic proxies set
 * up by neutron-worker-source.ts, NOT real Window/Document instances.
 *
 * chobitsu's default entry (`chobitsu/dist/chobitsu.js`) crashes during
 * module load because its DOMDebugger domain does
 * `window.Node.prototype` at top level. We dodge that by shimming the
 * intrinsics it expects BEFORE importing chobitsu — see `Shim` block
 * below. After shimming, chobitsu registers all its domains. We then
 * tear out the DOM-side domains that wouldn't do anything useful in a
 * worker realm anyway (DOM/CSS/Overlay/Page/DOMDebugger/etc.).
 *
 * Transport: vanilla `self.postMessage` / `self.addEventListener` —
 * there is no scramjet trap on workers, no special envelope. The host
 * filters on `type: 'helium.devtools.worker-*'` to multiplex our
 * traffic away from existing Neutron callback marshalling.
 *
 * Built by `rolldown.config.ts` in this directory into
 * `dist/devtools-worker-agent.js` as a single IIFE. The host loads
 * the source text via fetch() at the assets path and ships it to the
 * worker through a `worker-attach` message; the worker eval()s it.
 */

// ─────────────────────────────────────────────────────────────────────────
// Shim block. Runs FIRST so chobitsu's DOMDebugger top-level doesn't
// dereference undefined.
// ─────────────────────────────────────────────────────────────────────────
//
// chobitsu/dist/cjs/domains/DOMDebugger.js, top-level:
//
//   var getWinEventProto = function () {
//     return safeGet(window, 'EventTarget.prototype') || window.Node.prototype;
//   };
//   var winEventProto = getWinEventProto();
//   var origAddEvent = winEventProto.addEventListener;
//   ...
//
// In a worker, `window` is undefined. We:
//   1. alias `globalThis.window = self` (synthetic in the neutron worker
//      — already a Proxy that round-trips DOM calls to the page; but
//      our shim sets `window` on globalThis ABOVE the user script
//      eval, so chobitsu's top-level finds something).
//   2. provide a Node-prototype-shaped object whose addEventListener /
//      removeEventListener already point at EventTarget.prototype's
//      methods. Both methods exist on workers' EventTarget — the
//      worker itself is an EventTarget — so the patches chobitsu applies
//      decorate something callable.
//
// Side effect: chobitsu's addEventListener patches will be applied to
// EventTarget.prototype, affecting worker-internal listeners. That's
// acceptable — chobitsu's patch is wrapper code that delegates to the
// original, so we don't lose functionality.
//
// We only need the shim to survive the FIRST evaluation of chobitsu.
// After registration completes we restore the original `window` slot
// (which neutron-worker-source.ts has overwritten with a DOM proxy).
//
const __saved_window = (globalThis as { window?: unknown }).window;
const __EventTargetProto = (globalThis as { EventTarget?: { prototype: unknown } }).EventTarget?.prototype;
// Build a minimal `window` shape with the exact slots chobitsu reads.
(globalThis as { window?: unknown }).window = {
	// chobitsu/dist/cjs/domains/DOMDebugger.js calls
	// `safeGet(window, 'EventTarget.prototype') || window.Node.prototype`
	// — provide both paths.
	EventTarget: { prototype: __EventTargetProto },
	Node: { prototype: __EventTargetProto },
	// Various chobitsu domains touch these. Real worker has them as
	// globals already; the shim window just borrows them.
	document: undefined,
	location: (globalThis as { location?: unknown }).location,
	console: (globalThis as { console?: unknown }).console,
	addEventListener: (globalThis as { addEventListener?: unknown }).addEventListener,
	removeEventListener: (globalThis as { removeEventListener?: unknown }).removeEventListener,
};

// ─────────────────────────────────────────────────────────────────────────
// Import chobitsu. Module load triggers the registration of every
// domain — DOM/CSS/Overlay/Page will register but their methods will
// never get called in a worker because the worker doesn't speak those
// domains (no `DOM.enable` etc. from the front-end).
// ─────────────────────────────────────────────────────────────────────────
//
// We deliberately import the default bundle so all licia polyfills /
// noop helpers are pulled in once. The unused domains add bytes but
// keep the build simple.
import chobitsu from 'chobitsu';

// Restore neutron-worker-source.ts's synthetic `window` proxy so any
// user script body that runs AFTER us still sees the proxy DOM access.
// (Order is: neutron-worker-source.ts boots → user content script runs
// → user opens DevTools → host injects this agent. By the time we run,
// `window` has already been set to the synthetic DOM proxy; we
// temporarily overrode it, now restore.)
(globalThis as { window?: unknown }).window = __saved_window;

// ─────────────────────────────────────────────────────────────────────────
// Transport.
// ─────────────────────────────────────────────────────────────────────────

interface AttachInit {
	frameId: string;
	url: string;
	title: string;
}

function isAttachInit(v: unknown): v is AttachInit {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.frameId === 'string' &&
		typeof o.url === 'string' &&
		typeof o.title === 'string'
	);
}

function isInboundCdp(v: unknown): v is { type: string; frameId: string; payload: string } {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return (
		o.type === 'helium.devtools.worker-in' &&
		typeof o.frameId === 'string' &&
		typeof o.payload === 'string'
	);
}

function emit(message: Record<string, unknown>): void {
	try {
		(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
			type: 'helium.devtools.worker-out',
			message,
		});
	} catch (err) {
		// Avoid recursion via console — host listener may have died.
		// eslint-disable-next-line no-console
		console.warn('[ddx-devtools-worker-agent] emit failed:', err);
	}
}

// ─────────────────────────────────────────────────────────────────────────
// The agent IIFE is invoked by the worker host wrapper as
//   __ddxDevtoolsWorkerAgentBoot__({ frameId, url, title });
// so we expose a single boot function rather than auto-running. This
// avoids ambiguity about who reads the init message.
// ─────────────────────────────────────────────────────────────────────────

let booted = false;

(self as unknown as { __ddxDevtoolsWorkerAgentBoot__: (init: unknown) => void })
	.__ddxDevtoolsWorkerAgentBoot__ = function bootAgent(init: unknown): void {
	if (booted) return;
	if (!isAttachInit(init)) {
		// eslint-disable-next-line no-console
		console.warn('[ddx-devtools-worker-agent] bad init payload:', init);
		return;
	}
	booted = true;

	const { frameId, url, title } = init;

	// chobitsu → host: every outbound message becomes a cdp-out event.
	chobitsu.setOnMessage((payload: string) => {
		emit({ kind: 'cdp-out', frameId, payload });
	});

	// host → chobitsu: pump CDP request strings into chobitsu.
	self.addEventListener('message', (e: MessageEvent) => {
		const data = e.data;
		if (!isInboundCdp(data)) return;
		if (data.frameId !== frameId) return;
		try {
			chobitsu.sendRawMessage(data.payload);
		} catch (err) {
			emit({
				kind: 'agent-error',
				frameId,
				message: err instanceof Error ? err.message : String(err),
			});
		}
	});

	// Announce ourselves as a top-level target — workers have no
	// parent frame in the multiplexer's tree.
	emit({
		kind: 'frame-ready',
		frameId,
		parentFrameId: null,
		url,
		title,
	});
};
