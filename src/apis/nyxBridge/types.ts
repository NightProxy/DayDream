// src/apis/nyxBridge/types.ts
//
// Internal types — handshake state, channel envelope, request shapes.
// Not exposed to NyxAI. The public contract lives in api.ts.

import type { ErrorCode } from './api';

// ── Channel envelopes ───────────────────────────────────────────────

export interface NyxRequestEnvelope {
	requestId: string;
	type: string; // method name from METHOD_REGISTRY, OR "__handshake.init" / "__handshake.complete"
	sessionId?: string;
	args?: unknown;
}

export interface NyxResponseSuccess {
	requestId: string;
	ok: true;
	result: unknown;
}

export interface NyxResponseError {
	requestId: string;
	ok: false;
	error: { code: ErrorCode; message: string };
}

export type NyxResponse = NyxResponseSuccess | NyxResponseError;

// ── Handshake state ─────────────────────────────────────────────────

export type HandshakeState =
	| { kind: 'challenged'; iframe: HTMLIFrameElement; expectedToken: string; createdAt: number }
	| { kind: 'trusted'; iframe: HTMLIFrameElement; createdAt: number };

export interface TrustVerification {
	ok: boolean;
	code?: ErrorCode;
	reason?: string;
}

// ── Internal error ──────────────────────────────────────────────────

export class DDXError extends Error {
	override name = 'DDXError' as const;
	code: ErrorCode;
	constructor(code: ErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}
