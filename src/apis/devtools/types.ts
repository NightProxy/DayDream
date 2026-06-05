/**
 * Shared types for the devtools subsystem.
 *
 * - `DevtoolsMessage` is the inner protocol carried inside the Scramjet
 *   `$scramjet$data` envelope between host and per-frame agents.
 * - `FrameRecord` is the multiplexer's per-frame bookkeeping shape.
 * - `TargetInfo` matches the CDP `Target.TargetInfo` type we synthesize.
 */

export type DevtoolsMessage =
	| {
			kind: 'frame-ready';
			frameId: string;
			parentFrameId: string | null;
			url: string;
			title: string;
	  }
	| { kind: 'frame-gone'; frameId: string }
	| { kind: 'cdp-out'; frameId: string; payload: string }
	| { kind: 'cdp-in'; frameId: string; payload: string }
	| { kind: 'agent-error'; frameId: string; message: string };

export interface FrameRecord {
	frameId: string;
	parentFrameId: string | null;
	url: string;
	title: string;
	postToFrame: (cdpJson: string) => void;
}

export interface TargetInfo {
	targetId: string;
	type: 'page' | 'iframe';
	title: string;
	url: string;
	attached: boolean;
	canAccessOpener: false;
}

/**
 * Tag used on the bridge messages exchanged between the host and the
 * devtools-frontend iframe (via the WebSocket shim). Plain postMessage,
 * not Scramjet-enveloped (same-origin).
 */
export type DevtoolsBridgeMessage =
	| { kind: 'devtools-ready' }
	| { kind: 'cdp-from-devtools'; payload: string }
	| { kind: 'cdp-to-devtools'; payload: string };
