import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(configDir, '../..');

/**
 * Build the Terbium TAPP integration shims as a single self-contained
 * `dist/terbium/boot.js`.
 *
 * IIFE format because boot.js is injected as a classic <script> tag
 * (not `type="module"`). A classic script with `export` statements is
 * a SyntaxError, and `type="module"` is implicitly deferred which
 * would break the "runs BEFORE Daydream's bundle" ordering invariant
 * we need to set window.__ddxOverrideWisp before Proxy constructs.
 *
 * `inlineDynamicImports: true` rolls boot.ts's runtime imports of
 * `./downloads`, `./island`, and `@apis/settings` into the same
 * bundle, so there's exactly one file the browser needs to load.
 * This sidesteps the "dynamic import requires ESM target" problem
 * (the dynamic imports are removed entirely at build time). Note:
 * rolldown emits a deprecation warning for this flag in favour of
 * `codeSplitting: false`, but as of rolldown 1.x both work; flip if
 * the flag is removed.
 *
 * `name: '__terbiumBoot'` is the IIFE's global; we don't actually use
 * it from outside, but rolldown emits a
 * `[MISSING_NAME_OPTION_FOR_IIFE_EXPORT]` warning without it.
 */
export default defineConfig({
	input: resolve(configDir, 'boot.ts'),
	platform: 'browser',
	output: {
		file: resolve(ROOT, 'dist/terbium/boot.js'),
		format: 'iife',
		name: '__terbiumBoot',
		inlineDynamicImports: true,
		minify: true
	},
	resolve: {
		alias: {
			'@apis': resolve(ROOT, 'src/apis'),
			'@utils': resolve(ROOT, 'src/utils')
		},
		tsconfigFilename: resolve(ROOT, 'tsconfig.json')
	}
});
