import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(configDir, '../..');

/**
 * Build the Terbium TAPP integration shims to `dist/terbium/`.
 *
 * - `boot.js` runs first in the TAPP HTML (injected by the
 *   `terbium-tapp` Vite plugin) and detects `window.parent.tb` to set
 *   up the Wisp override / SW handoff before Daydream's main bundle
 *   constructs `Proxy`.
 * - `downloads.js` registers a `DownloadProvider` that routes downloads
 *   through `tb.dialog.SaveFile` + `tb.fs.promises.writeFile`.
 * - `island.js` adds an App Island menu control.
 *
 * The plain `pnpm run build` step does NOT call this — only
 * `pnpm run build:tapp` runs it, after the main build, so the files
 * are present when the TAPP plugin zips `dist/`.
 */
export default defineConfig({
	input: {
		boot: resolve(configDir, 'boot.ts'),
		downloads: resolve(configDir, 'downloads.ts'),
		island: resolve(configDir, 'island.ts')
	},
	platform: 'browser',
	output: {
		dir: resolve(ROOT, 'dist/terbium'),
		format: 'esm',
		entryFileNames: '[name].js',
		chunkFileNames: 'chunks/[name]-[hash].js',
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
