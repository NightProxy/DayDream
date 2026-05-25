/**
 * Build `controller.sw.js` — the service-worker IIFE that handles the
 * `fetch` event for proxied URLs by RPCing them up to the host-page
 * controller (which does the actual fetch + rewrite).
 *
 * Mirrors the prebuilt
 * `node_modules/@mercuryworkshop/scramjet-controller/dist/controller.sw.js`.
 *
 * SW context only — output references `self.skipWaiting`, `clients`, etc.
 */

import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
// configDir = <repo>/src/core/SJ/controller — four `..` segments reach
// the repo root. Update if this file moves.
const repoRoot = resolve(configDir, '..', '..', '..', '..');

export default defineConfig({
	input: resolve(configDir, 'src', 'sw.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'sw.js'),
		format: 'iife',
		name: '$scramjetController',
		extend: true,
		minify: true
	},
	resolve: {
		alias: {
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
