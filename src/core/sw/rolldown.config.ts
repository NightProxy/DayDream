import { defineConfig, type Plugin } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Rolldown plugin: turn Vite-style `import foo from 'pkg/file.ext?url'`
 * specifiers into a string export pointing at a runtime URL.
 *
 * `src/pkgs/pulsar/index.ts` (and potentially other deps) use Vite's
 * `?url` import to get a hashed asset URL at page-build time. That
 * syntax is unknown to rolldown, so without this plugin the SW build
 * fails with `UNLOADABLE_DEPENDENCY`.
 *
 * The mapping below produces a stable runtime path for each known asset
 * (the SW is served from the root, so absolute paths work). If more
 * `?url` imports appear, add them here.
 */
function urlImportPlugin(): Plugin {
	const RUNTIME_URLS: Record<string, string> = {
		'libcurl.js/libcurl.wasm': '/libcurl/libcurl.wasm'
	};

	const SUFFIX = '?url';
	const VIRTUAL_PREFIX = '\0url-import:';

	return {
		name: 'sw-url-import',
		resolveId(source) {
			if (!source.endsWith(SUFFIX)) return null;
			const bare = source.slice(0, -SUFFIX.length);
			const runtime = RUNTIME_URLS[bare];
			if (!runtime) {
				throw new Error(
					`[sw-url-import] No runtime URL mapping for '${bare}'. ` +
						`Add it to RUNTIME_URLS in src/core/sw/rolldown.config.ts.`
				);
			}
			return VIRTUAL_PREFIX + runtime;
		},
		load(id) {
			if (!id.startsWith(VIRTUAL_PREFIX)) return null;
			const url = id.slice(VIRTUAL_PREFIX.length);
			return `export default ${JSON.stringify(url)};`;
		}
	};
}

export default defineConfig({
	input: resolve(configDir, 'index.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist/sw.js'),
		format: 'iife',
		minify: true
	},
	plugins: [urlImportPlugin()]
});
