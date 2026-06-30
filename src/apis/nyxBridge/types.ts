
import type { ErrorCode } from './api';

export interface NyxRequestEnvelope {
	requestId: string;
	type: string;
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

export type HandshakeState =
	| { kind: 'challenged'; iframe: HTMLIFrameElement; expectedToken: string; createdAt: number }
	| { kind: 'trusted'; iframe: HTMLIFrameElement; createdAt: number };

export interface TrustVerification {
	ok: boolean;
	code?: ErrorCode;
	reason?: string;
}

export class DDXError extends Error {
	override name = 'DDXError' as const;
	code: ErrorCode;
	constructor(code: ErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}
