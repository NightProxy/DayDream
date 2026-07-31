import {
	initSync,
	encode as obscuraEncode,
	decode as obscuraDecode,
	is_daylight_token as isDaylightToken
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

function legacyDecode(s: string): string {
	const [input, ...search] = s.split('?');
	const xored = decodeURIComponent(input)
		.split('')
		.map((char, ind) =>
			ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char
		)
		.join('');
	return xored + (search.length ? '?' + search.join('?') : '');
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
	? guardEmpty((s: string) => {
			try {
				return obscuraEncode(s);
			} catch (err) {
				console.warn('[obscura] encode failed, passing through', s, err);
				return s;
			}
		})
	: guardEmpty((s: string) => {
			try {
				return encodeURIComponent(s);
			} catch {
				return s;
			}
		});

function daylightPayload(s: string): string | null {
	if (isDaylightToken(s)) return s;

	// Callers slice at the bare config prefix (`/assets/res/`) even when the
	// URL was encoded under a per-frame prefix
	// (`/assets/res/<controllerId>/<frameId>/`), so the leading id segments
	// can still be attached to the token. A token never contains `/`, so the
	// final segment is the payload. Without this, a valid token falls through
	// to legacyDecode and yields garbage that fails URL.canParse upstream.
	const slash = s.lastIndexOf('/');
	if (slash === -1) return null;

	const tail = s.slice(slash + 1);
	return tail && isDaylightToken(tail) ? tail : null;
}

export const decode: (s: string) => string = ready
	? guardEmpty((s: string) => {
			const payload = daylightPayload(s);
			if (payload !== null) {
				try {
					return obscuraDecode(payload);
				} catch (err) {
					console.warn('[obscura] decode failed', payload, err);
				}
			}
			try {
				return legacyDecode(s);
			} catch {
				try {
					return decodeURIComponent(s);
				} catch {
					return s;
				}
			}
		})
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
