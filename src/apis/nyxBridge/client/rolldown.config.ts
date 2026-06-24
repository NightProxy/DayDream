import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'runtime.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'nyx-bridge-client.js'),
		format: 'iife',
		minify: true,
	},
});
