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

const __saved_window = (globalThis as { window?: unknown }).window;
const __EventTargetProto = (globalThis as { EventTarget?: { prototype: unknown } }).EventTarget?.prototype;
(globalThis as { window?: unknown }).window = {
	EventTarget: { prototype: __EventTargetProto },
	Node: { prototype: __EventTargetProto },
	document: undefined,
	location: (globalThis as { location?: unknown }).location,
	console: (globalThis as { console?: unknown }).console,
	addEventListener: (globalThis as { addEventListener?: unknown }).addEventListener,
	removeEventListener: (globalThis as { removeEventListener?: unknown }).removeEventListener,
};

import chobitsu from 'chobitsu';

(globalThis as { window?: unknown }).window = __saved_window;

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
		// eslint-disable-next-line no-console
		console.warn('[ddx-devtools-worker-agent] emit failed:', err);
	}
}

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

	chobitsu.setOnMessage((payload: string) => {
		emit({ kind: 'cdp-out', frameId, payload });
	});

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

	emit({
		kind: 'frame-ready',
		frameId,
		parentFrameId: null,
		url,
		title,
	});
};
