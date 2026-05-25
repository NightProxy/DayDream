import { basePath } from '@core/shared/path';
import { scramjetFlags } from './flags.js';
import {
	encode as __obscuraEncode,
	decode as __obscuraDecode
} from '../../../pkgs/Obscura/dist/obscura.js';
var _b = basePath || '/';
if (!self.__obscura || self.__obscura.ready !== true) {
	throw new Error(
		'[scramjet-config] Obscura failed to initialize on the host page; URL codec will be broken.'
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
