import {
	initSync,
	encode as obscuraEncode,
	decode as obscuraDecode
} from './pkg/obscura.js';


import * as wasmModule from './pkg/obscura_bg.wasm';
const wasmBase64: string = (wasmModule as unknown as { default: string })
	.default;

function base64ToBytes(b64: string): Uint8Array {

	const binary =
		typeof atob === 'function'
			? atob(b64)
			: 
			(globalThis as any).Buffer.from(b64, 'base64').toString(
					'binary'
				);
	const len = binary.length;
	const out = new Uint8Array(len);
	for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i) & 0xff;
	return out;
}

let ready = false;
try {
	initSync({ module: base64ToBytes(wasmBase64) });
	ready = true;
} catch (err) {
	console.error('[obscura] initSync failed', err);
}

const guardEmpty =
	(f: (s: string) => string) =>
	(s: string): string => {
		if (!s) return s;
		return f(s);
	};

export const encode: (s: string) => string = ready
	? guardEmpty(obscuraEncode)
	: guardEmpty((s: string) => {
			try {
				return encodeURIComponent(s);
			} catch {
				return s;
			}
		});

export const decode: (s: string) => string = ready
	? guardEmpty(obscuraDecode)
	: guardEmpty((s: string) => {
			try {
				return decodeURIComponent(s);
			} catch {
				return s;
			}
		});

export const obscura = { ready, encode, decode };

(globalThis as any).__obscura = obscura;

export default obscura;
