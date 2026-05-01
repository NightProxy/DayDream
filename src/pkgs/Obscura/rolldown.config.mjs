import { defineConfig } from 'rolldown';

// Bundle Obscura into a single self-contained ES module with the wasm bytes
// embedded as a base64 string. The output module auto-runs `initSync` on
// import and exposes `encode` / `decode` plus an `__obscura` global.
export default defineConfig({
	input: 'src/pkgs/Obscura/entry.ts',
	output: {
		file: 'src/pkgs/Obscura/dist/obscura.js',
		format: 'esm',
		// Single-file artifact: no chunk splitting, downstream bundlers can
		// pull this in as one module.
		codeSplitting: false
	},
	// Treat .wasm as a base64-encoded string. Combined with the default
	// import in entry.ts, this hard-codes the wasm bytes into the bundle.
	moduleTypes: {
		'.wasm': 'base64'
	}
});
