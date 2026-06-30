/**
 * Build `controller.inject.js` — the proxied-frame IIFE that gets loaded
 * via the controller's bootstrap data URL inside every proxied document.
 * Exposes `$scramjetController.load()` for the inline bootstrap to call.
 *
 * Mirrors the prebuilt
 * `node_modules/@mercuryworkshop/scramjet-controller/dist/controller.inject.js`.
 */

import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, '..', '..', '..', '..');

export default defineConfig({
	input: resolve(configDir, 'src', 'inject.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'inject.js'),
		format: 'iife',
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
	}
});
