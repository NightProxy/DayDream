import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'index.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'nyx-bridge-agent.js'),
		format: 'iife',
		minify: true,
	},
});
