// src/apis/nyxBridge/frameTransport.ts
//
// Envelope codec for host ↔ per-frame agent messages. Wraps payloads in
// Scramjet's `$scramjet$messagetype` envelope so the proxied iframe's
// patched `Window.postMessage` accepts them as legitimate window-typed
// messages. Tagged with `__nyxBridgeMsg: true` so the host can route
// without colliding with other Scramjet traffic.
//
// Mirrors src/apis/devtools/frameTransport.ts but with `__nyxBridgeMsg`
// instead of `__ddxDevtoolsMsg`.

export interface AgentMessage {
	kind: 'frame-ready' | 'frame-gone' | 'cdp-out' | 'agent-error';
	frameId: string;
	payload?: string;
	message?: string;
}

const TAG = '__nyxBridgeMsg';

export function encodeEnvelope(msg: AgentMessage): any {
	return {
		$scramjet$messagetype: 'window',
		$scramjet$origin: typeof location !== 'undefined' ? location.origin : 'unknown',
		$scramjet$data: { ...msg, [TAG]: true },
	};
}

export function decodeEnvelope(raw: any): AgentMessage | null {
	if (!raw || typeof raw !== 'object') return null;
	const data = raw.$scramjet$messagetype && raw.$scramjet$data ? raw.$scramjet$data : raw;
	if (!data || typeof data !== 'object') return null;
	if (!(data as any)[TAG]) return null;
	const { [TAG]: _ignored, ...rest } = data as any;
	void _ignored;
	return rest as AgentMessage;
}
