
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
