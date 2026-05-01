// Obscura bundle entry.
//
// This file is the source for a self-contained Obscura JS+WASM bundle. The
// raw wasm-pack output (`pkg/obscura.js`) ships with a default async `init()`
// and a sync `initSync()`, but neither is run automatically — the consumer
// must wire one of them up and provide the wasm bytes.
//
// We want a drop-in module that:
//   1. Has the wasm bytes embedded (no second HTTP fetch).
//   2. Initializes synchronously on first module evaluation.
//   3. Exposes `encode` / `decode` directly.
//   4. Attaches `{ ready, encode, decode }` to `globalThis.__obscura`.
//
// rolldown is configured (see `rolldown.config.mjs` next to this file) to
// load `*.wasm` imports with the `base64` module type, so the wasm contents
// arrive at runtime as a base64-encoded string. We decode that once at
// module-eval time and feed it to `initSync`.

import {
	initSync,
	encode as obscuraEncode,
	decode as obscuraDecode
} from './pkg/obscura.js';

// rolldown's `base64` moduleType (configured in rolldown.config.mjs) makes
// `*.wasm` imports resolve to a base64-encoded string at runtime, exposed as
// the module's default export. wasm-pack ships a sibling `.d.ts` that types
// the wasm module's namespace (memory, malloc, etc.) and lacks a default
// export, so we import the namespace here, cast it through `unknown`, and
// reach for `.default` at runtime.
import * as wasmModule from './pkg/obscura_bg.wasm';
const wasmBase64: string = (wasmModule as unknown as { default: string })
	.default;

function base64ToBytes(b64: string): Uint8Array {
	// atob is available in browsers, web workers and modern Node. We avoid
	// Buffer to keep this bundle environment-agnostic.
	const binary =
		typeof atob === 'function'
			? atob(b64)
			: // Fallback for environments without atob (very unlikely in our
				// targets, but keeps the bundle from crashing in Node REPL).
				// eslint-disable-next-line @typescript-eslint/no-require-imports
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
	// Surface the failure but don't throw — callers can check `ready`.
	console.error('[obscura] initSync failed', err);
}

export const encode: (s: string) => string = ready
	? obscuraEncode
	: (s: string) => {
			try {
				return encodeURIComponent(s);
			} catch {
				return s;
			}
		};

export const decode: (s: string) => string = ready
	? obscuraDecode
	: (s: string) => {
			try {
				return decodeURIComponent(s);
			} catch {
				return s;
			}
		};

export const obscura = { ready, encode, decode };

// Attach to the global so non-module call sites (and the legacy
// `obscura-init.js` shim) can see it.
(globalThis as any).__obscura = obscura;

export default obscura;
