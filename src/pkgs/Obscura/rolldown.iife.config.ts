import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'entry.ts'),
	output: {
		file: resolve(configDir, 'dist/obscura.iife.js'),
		format: 'iife',
		name: '__ddxObscuraIIFE',
		codeSplitting: false,
		minify: true
	},
	moduleTypes: {
		'.wasm': 'base64'
	}
});
