/**
 * Build the devtools per-frame agent into a single IIFE that the
 * hookInstaller injects via <script src> into every proxied window
 * for tabs with DevTools open.
 *
 * Mirrors the controller's inject build (see
 * src/core/SJ/controller/rolldown.inject.config.ts) — IIFE, browser
 * platform, minified, bundled chobitsu.
 */

import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'index.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'devtools-agent.js'),
		format: 'iife',
		minify: true,
	},
});
