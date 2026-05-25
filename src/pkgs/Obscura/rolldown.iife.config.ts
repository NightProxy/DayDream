import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

// IIFE-format Obscura bundle, alongside the existing ESM `dist/obscura.js`.
//
// The ESM build is consumed via `import` by the host page's SJ config and
// other host-side code. The IIFE build is consumed differently: it gets
// inlined as raw text into the controller's `getInjectScripts` data URL,
// which evaluates it inside each proxied frame so that frame can have its
// own WASM-backed obscura instance (the host's instance can't be passed
// across realms via Function.toString() — closures don't survive).
//
// `entry.ts` already does `globalThis.__obscura = obscura` as a side
// effect, so the IIFE form just needs to evaluate that side effect. The
// outer wrapper exposes nothing on a global by name (we set `name` to
// satisfy rolldown's iife format requirement, but we don't read it).
export default defineConfig({
	input: resolve(configDir, 'entry.ts'),
	output: {
		file: resolve(configDir, 'dist/obscura.iife.js'),
		format: 'iife',
		// rolldown's iife format requires a global name even though we
		// only care about the side effect (globalThis.__obscura). Pick
		// a tag that won't collide with anything else; we never read it.
		name: '__ddxObscuraIIFE',
		codeSplitting: false,
		minify: true
	},
	moduleTypes: {
		'.wasm': 'base64'
	}
});
