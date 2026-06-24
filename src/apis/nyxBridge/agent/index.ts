// src/apis/nyxBridge/agent/index.ts
//
// Per-frame agent for NyxBridge. Bundled to an IIFE by
// agent/rolldown.config.ts and injected (via hookInstaller) into every
// non-Nyx proxied frame the bridge wants to drive. Mirrors
// src/apis/devtools/agent/index.ts but:
//
//   - Exposes window.__nyxBridgeReceive instead of __ddxDevtoolsReceive
//   - Posts envelopes tagged __nyxBridgeMsg via frameTransport.encodeEnvelope
//   - Uses sessionStorage key "nyx-frame-id" so devtools-agent and
//     bridge-agent in the same frame don't collide on frame ids.

import chobitsu from 'chobitsu';
import { encodeEnvelope, type AgentMessage } from '../frameTransport';

let booted = false;

function getOrCreateFrameId(): string {
	const KEY = 'nyx-frame-id';
	try {
		const existing = sessionStorage.getItem(KEY);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		sessionStorage.setItem(KEY, fresh);
		return fresh;
	} catch {
		return crypto.randomUUID();
	}
}

function postToHost(msg: AgentMessage): void {
	try {
		window.parent.postMessage(encodeEnvelope(msg), '*');
	} catch (err) {
		console.warn('[nyx-agent] postToHost failed:', err);
	}
}

export function bootAgent(): void {
	if (booted) return;
	booted = true;

	const frameId = getOrCreateFrameId();

	chobitsu.setOnMessage((payload: string) => {
		postToHost({ kind: 'cdp-out', frameId, payload });
	});

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
		Object.defineProperty(window, '__nyxBridgeReceive', {
			value: receive,
			writable: true,
			configurable: true,
			enumerable: false,
		});
	} catch (err) {
		console.warn('[nyx-agent] could not install receiver:', err);
		return;
	}

	postToHost({ kind: 'frame-ready', frameId });
	window.addEventListener('beforeunload', () => postToHost({ kind: 'frame-gone', frameId }));
}

bootAgent();
