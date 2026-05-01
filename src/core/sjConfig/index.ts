import { basePath } from '@core/shared/path';
// Pre-bundled Obscura: a single ES module with the wasm bytes inlined as
// base64 and `initSync` running on import. It exports `encode` / `decode`
// directly and also pins itself to `globalThis.__obscura`.
//
// Building this once up front (`bun run obscura:bundle`) means sjConfig pulls
// in a self-contained codec — no second HTTP fetch, no async dance, no
// blocking XHR. SJ V2 runs on the main thread, so attaching here is enough.
import {
	encode as __obscuraEncode,
	decode as __obscuraDecode,
	obscura as __obscura
} from '../../pkgs/Obscura/dist/obscura.js';

var _b = basePath || '/';

// Re-pin in case load order ever ends up with this module evaluated before
// the obscura bundle's own side-effectful `globalThis.__obscura = ...` runs
// (it shouldn't, since we statically import it, but cheap insurance).
self.__obscura = __obscura;

/*self.__scramjet$config = {
	prefix: _b + 'assets/res/',
	files: {
		wasm: _b + 'assets/wasm.wasm',
		all: _b + 'assets/all.js',
		sync: _b + 'assets/sync.js'
	},
	flags: {
		captureErrors: false,
		cleanErrors: true,
		naiiveRewriter: false,
		rewriterLogs: false,
		scramitize: false,
		serviceworkers: false,
		sourcemaps: true,
		strictRewrites: true,
		syncxhr: false
	},
	codec: {
		encode: (url: string) => {
			if (!url) return url;
			try {
				const input = url.toString();
				const z85Chars =
					'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
				const encoded = encodeURIComponent(input);
				const bytes = new TextEncoder().encode(encoded);
				const pad = (4 - (bytes.length % 4)) % 4;
				const padded = new Uint8Array(bytes.length + pad);
				padded.set(bytes);
				for (let i = bytes.length; i < padded.length; i++)
					padded[i] = 95;

				let out = '';
				for (let i = 0; i < padded.length; i += 4) {
					let value =
						((padded[i] << 24) >>> 0) +
						(padded[i + 1] << 16) +
						(padded[i + 2] << 8) +
						padded[i + 3];
					const block = new Array(5);
					for (let j = 4; j >= 0; j--) {
						block[j] = z85Chars[value % 85];
						value = Math.floor(value / 85);
					}
					out += block.join('');
				}

				return encodeURIComponent(out);
			} catch {
				return url;
			}
		},

		decode: (url: string) => {
			if (!url) return url;
			try {
				const input = url.toString();
				const z85Chars =
					'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
				const z85Map: Record<string, number> = {};
				for (let i = 0; i < z85Chars.length; i++)
					z85Map[z85Chars[i]] = i;

				const decodedInput = decodeURIComponent(input);
				if (decodedInput.length % 5 !== 0) return url;

				const out = new Uint8Array((decodedInput.length / 5) * 4);
				let offset = 0;
				for (let i = 0; i < decodedInput.length; i += 5) {
					let value = 0;
					for (let j = 0; j < 5; j++) {
						const code = z85Map[decodedInput[i + j]];
						if (code === undefined) return url;
						value = value * 85 + code;
					}
					out[offset++] = (value >>> 24) & 0xff;
					out[offset++] = (value >>> 16) & 0xff;
					out[offset++] = (value >>> 8) & 0xff;
					out[offset++] = value & 0xff;
				}

				let end = out.length;
				let padCount = 0;
				while (end > 0 && out[end - 1] === 95 && padCount < 3) {
					end--;
					padCount++;
				}

				const unpadded = out.subarray(0, end);
				const percentEncoded = new TextDecoder().decode(unpadded);
				return decodeURIComponent(percentEncoded);
			} catch {
				return url;
			}
		}
	}
}; */

const scramjetConfig = {
	injectPath: _b + 'assets/inject.js',
	prefix: _b + 'assets/res/',
	scramjetPath: _b + 'assets/s.js',
	virtualWasmPath: 'wasm.js',
	wasmPath: _b + 'assets/s.wasm',
	codec: {
		encode: (url: string) => {
			if (!url) return url;

			return __obscuraEncode(url);
		},
		decode: (url: string) => {
			if (!url) return url;

			return __obscuraDecode(url);
		}
	}
};

self.__scramjet$config = scramjetConfig as SJConfig;

self.__scramjet$flags = {
	globals: {
		wrapfn: '$scramjet$wrap',
		wrappropertybase: '$scramjet__',
		wrappropertyfn: '$scramjet$prop',
		cleanrestfn: '$scramjet$clean',
		importfn: '$scramjet$import',
		rewritefn: '$scramjet$rewrite',
		metafn: '$scramjet$meta',
		wrappostmessagefn: '$scramjet$wrappostmessage',
		pushsourcemapfn: '$scramjet$pushsourcemap',
		trysetfn: '$scramjet$tryset',
		templocid: '$scramjet$temploc',
		tempunusedid: '$scramjet$tempunused'
	},
	flags: {
		syncxhr: false,
		strictRewrites: true,
		rewriterLogs: false,
		captureErrors: false,
		cleanErrors: false,
		scramitize: false,
		sourcemaps: true,
		destructureRewrites: false,
		allowInvalidJs: false,
		debugTrampolines: false,
		allowFailedIntercepts: false,
		encapsulateWorkers: true,
		debugSourceURL: false
	},
	siteFlags: {},
	maskedfiles: []
};
