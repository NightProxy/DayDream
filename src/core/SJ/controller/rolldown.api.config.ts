/**
 * Build `controller.api.js` — the host-page IIFE that exposes the
 * scramjet controller surface on `window.$scramjetController`.
 *
 * Mirrors the prebuilt
 * `node_modules/@mercuryworkshop/scramjet-controller/dist/controller.api.js`
 * (which we no longer ship; we use this local copy instead, kept under
 * `src/core/SJ/controller/src/`).
 *
 * `SCRAMJET_EXPECTED_VERSION` is injected at build time via rolldown's
 * `transform.define` below. The companion `CONTROLLER_VERSION` constant
 * is hardcoded as a literal in `src/version.ts` instead — it's the
 * controller's own version string and changes about as often as the
 * source itself, so threading it through a build-time define adds
 * complexity without buying anything.
 */

import { defineConfig, type Plugin } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const configDir = dirname(fileURLToPath(import.meta.url));
// configDir = <repo>/src/core/SJ/controller — four `..` segments reach
// the repo root. Update if this file moves.
const repoRoot = resolve(configDir, '..', '..', '..', '..');

// Read scramjet's version from the installed package so the runtime check
// stays in sync without manual updates here.
const scramjetVersion: string = JSON.parse(
	readFileSync(
		resolve(
			repoRoot,
			'node_modules/@mercuryworkshop/scramjet/package.json'
		),
		'utf8'
	)
).version;

/**
 * Rolldown plugin: resolves `<path>?text` imports to a module that
 * default-exports the file's UTF-8 text contents.
 *
 * Used by `src/core/SJ/controller/src/index.ts` to inline the Obscura
 * IIFE bundle (`src/pkgs/Obscura/dist/obscura.iife.js`) as a string so
 * the controller can splice it verbatim into the data URL bootstrap
 * delivered to proxied frames. See the data URL construction in
 * `yieldGetInjectScripts` for why we need the bundle's source as
 * inline text rather than as a module import.
 *
 * Usage in source:
 *   import OBSCURA_IIFE_SRC from '<...>/obscura.iife.js?text';
 *
 * The plugin is intentionally narrow — only the `?text` suffix triggers
 * it, so normal `.js` imports are unaffected.
 */
function rawTextPlugin(): Plugin {
	const SUFFIX = '?text';
	const VIRTUAL_PREFIX = '\0raw-text:';

	return {
		name: 'controller-raw-text',
		resolveId(source, importer) {
			if (!source.endsWith(SUFFIX)) return null;
			const bare = source.slice(0, -SUFFIX.length);
			// Resolve relative to the importing file when present.
			const abs = importer
				? resolve(dirname(importer), bare)
				: resolve(repoRoot, bare);
			return VIRTUAL_PREFIX + abs;
		},
		load(id) {
			if (!id.startsWith(VIRTUAL_PREFIX)) return null;
			const filePath = id.slice(VIRTUAL_PREFIX.length);
			const text = readFileSync(filePath, 'utf8');
			return `export default ${JSON.stringify(text)};`;
		}
	};
}

export default defineConfig({
	input: resolve(configDir, 'src', 'index.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'api.js'),
		format: 'iife',
		// Matches the prebuilt bundle's `var $scramjetController;(()=>{...})()`
		// shape. rolldown emits this as a top-level assignment.
		name: '$scramjetController',
		extend: true,
		minify: true
	},
	resolve: {
		alias: {
			'@mercuryworkshop/scramjet-controller': resolve(
				configDir,
				'src',
				'index.ts'
			),
			'@mercuryworkshop/rpc': resolve(
				repoRoot,
				'src',
				'core',
				'SJ',
				'rpc',
				'index.ts'
			)
		}
	},
	plugins: [rawTextPlugin()],
	transform: {
		// `version.ts` references `SCRAMJET_EXPECTED_VERSION` as a
		// build-time constant (matches what upstream's rspack
		// DefinePlugin supplies). It's used by the runtime
		// version-mismatch check against `$scramjet.versionInfo.version`,
		// so this value MUST match the installed scramjet's version —
		// hence reading it from node_modules above.
		define: {
			SCRAMJET_EXPECTED_VERSION: JSON.stringify(scramjetVersion)
		}
	}
});
