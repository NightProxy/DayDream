import { basePath } from '@core/shared/path';
import { scramjetFlags } from './flags.js';
import {
	encode as __obscuraEncode,
	decode as __obscuraDecode
} from '../../../pkgs/Obscura/dist/obscura.js';
var _b = basePath || '/';
// __obscuraEncode/__obscuraDecode are imported directly from the Obscura dist
// module and initialize synchronously via initSync inside that module.
// We warn here instead of throwing so that a slow globalThis.__obscura
// publication (which is set after initSync completes in entry.ts) does not
// prevent __scramjet$config from being set, which would cause the controller
// to fall back to its default encodeURIComponent codec and break URL decoding
// in the Scramjet SW.
if (!self.__obscura || self.__obscura.ready !== true) {
	console.warn(
		'[scramjet-config] __obscura not yet ready on globalThis — using directly imported codec functions. This is expected if config.ts runs before entry.ts sets globalThis.__obscura.'
	);
}
const scramjetConfig = {
	injectPath: _b + 'assets/inject.js',
	prefix: _b + 'assets/res/',
	scramjetPath: _b + 'assets/s.js',
	virtualWasmPath: 'wasm.js',
	wasmPath: _b + 'assets/s.wasm',
	codec: {
		encode: __obscuraEncode,
		decode: __obscuraDecode
	}
};

self.__scramjet$config = scramjetConfig as SJConfig;

self.__scramjet$flags = scramjetFlags;
