/**
 * Worker-flavoured devtools transport.
 *
 * The host ↔ Neutron-worker leg doesn't go through scramjet (workers
 * are spawned from a Blob URL with no scramjet client), so the
 * scramjet envelope and `__ddxDevtoolsReceive` tricks used for proxied
 * iframes are unnecessary. Instead we wrap CDP traffic in a small
 * `{kind, ...}` envelope namespaced with `helium.devtools.` so the
 * Neutron worker's existing per-frame message listener can ignore it
 * (Neutron only consumes messages tagged as RPC requests / callback
 * invocations — anything else falls through to consumer listeners).
 *
 * Same DevtoolsMessage shape as the iframe transport, just delivered
 * raw via `worker.postMessage` / `self.postMessage`.
 */
import type { DevtoolsMessage } from './types';

/** Host → worker: install the per-worker chobitsu agent. */
export interface WorkerAttachMessage {
	type: 'helium.devtools.worker-attach';
	/** Full IIFE source of the worker agent. Worker eval()s it. */
	src: string;
	/**
	 * Deterministic frame id the worker will announce as. The host
	 * sends this so the worker doesn't need a UUID generator (and the
	 * id stays the same across attach/detach pairs).
	 */
	frameId: string;
	/** Optional title for the multiplexer's TargetInfo. */
	title: string;
	/** Optional URL for the multiplexer's TargetInfo. */
	url: string;
}

export function isWorkerAttachMessage(v: unknown): v is WorkerAttachMessage {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return (
		o.type === 'helium.devtools.worker-attach' &&
		typeof o.src === 'string' &&
		typeof o.frameId === 'string'
	);
}

/** Worker → host: agent emits DevtoolsMessage events. */
export interface WorkerOutboundMessage {
	type: 'helium.devtools.worker-out';
	message: DevtoolsMessage;
}

export function isWorkerOutboundMessage(v: unknown): v is WorkerOutboundMessage {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	if (o.type !== 'helium.devtools.worker-out') return false;
	const m = o.message as { kind?: unknown } | undefined;
	return !!m && typeof m === 'object' && typeof m.kind === 'string';
}

/** Host → worker: CDP request payload to feed into chobitsu.sendRawMessage. */
export interface WorkerInboundMessage {
	type: 'helium.devtools.worker-in';
	frameId: string;
	payload: string;
}

export function isWorkerInboundMessage(v: unknown): v is WorkerInboundMessage {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return (
		o.type === 'helium.devtools.worker-in' &&
		typeof o.frameId === 'string' &&
		typeof o.payload === 'string'
	);
}
