import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'index.ts'),
	output: {
		file: resolve(configDir, 'dist/sw.js'),
		format: 'iife',
		minify: true
	}
});
