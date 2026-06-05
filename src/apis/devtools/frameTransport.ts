/**
 * Envelope helpers for host <-> per-frame agent postMessage transport.
 *
 * Scramjet has trapped Window.prototype.postMessage inside proxied
 * windows. Its wrapper expects every message to be wrapped in
 * `{$scramjet$messagetype, $scramjet$origin, $scramjet$data}`. Using
 * `messagetype: 'window'` causes the wrapper to unwrap and deliver
 * `$scramjet$data` as the visible `event.data` on the proxied side.
 *
 * To distinguish our devtools messages from any other host->frame
 * traffic that might use the same envelope, we tag `$scramjet$data`
 * with `__ddxDevtoolsMsg: true`. Decoders check for the tag.
 */

import type { DevtoolsMessage } from './types';

export const DEVTOOLS_HOST_TAG = '__ddxDevtoolsMsg';

const VALID_KINDS = new Set([
	'frame-ready',
	'frame-gone',
	'cdp-out',
	'cdp-in',
	'agent-error',
]);

export function encodeEnvelope(
	origin: string,
	message: DevtoolsMessage
): unknown {
	return {
		$scramjet$messagetype: 'window',
		$scramjet$origin: origin,
		$scramjet$data: {
			...(message as unknown as Record<string, unknown>),
			[DEVTOOLS_HOST_TAG]: true,
		},
	};
}

export function decodeEnvelope(raw: unknown): DevtoolsMessage | null {
	if (!raw || typeof raw !== 'object') return null;
	const env = raw as Record<string, unknown>;
	if (env.$scramjet$messagetype !== 'window') return null;
	const data = env.$scramjet$data;
	if (!data || typeof data !== 'object') return null;
	const d = data as Record<string, unknown>;
	if (d[DEVTOOLS_HOST_TAG] !== true) return null;
	const kind = d.kind;
	if (typeof kind !== 'string' || !VALID_KINDS.has(kind)) return null;

	switch (kind) {
		case 'frame-ready': {
			const { frameId, parentFrameId, url, title } = d as {
				frameId?: unknown;
				parentFrameId?: unknown;
				url?: unknown;
				title?: unknown;
			};
			if (typeof frameId !== 'string') return null;
			if (parentFrameId !== null && typeof parentFrameId !== 'string')
				return null;
			if (typeof url !== 'string') return null;
			if (typeof title !== 'string') return null;
			return { kind: 'frame-ready', frameId, parentFrameId, url, title };
		}
		case 'frame-gone': {
			const { frameId } = d as { frameId?: unknown };
			if (typeof frameId !== 'string') return null;
			return { kind: 'frame-gone', frameId };
		}
		case 'cdp-out':
		case 'cdp-in': {
			const { frameId, payload } = d as {
				frameId?: unknown;
				payload?: unknown;
			};
			if (typeof frameId !== 'string') return null;
			if (typeof payload !== 'string') return null;
			return {
				kind: kind as 'cdp-out' | 'cdp-in',
				frameId,
				payload,
			};
		}
		case 'agent-error': {
			const { frameId, message } = d as {
				frameId?: unknown;
				message?: unknown;
			};
			if (typeof frameId !== 'string') return null;
			if (typeof message !== 'string') return null;
			return { kind: 'agent-error', frameId, message };
		}
		default:
			return null;
	}
}
