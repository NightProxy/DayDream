import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'entry.ts'),
	output: {
		file: resolve(configDir, 'dist/obscura.js'),
		format: 'esm',
		codeSplitting: false
	},
	moduleTypes: {
		'.wasm': 'base64'
	}
});
