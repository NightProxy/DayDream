/**
 * Build the worker-flavoured devtools agent into a single IIFE that
 * the host evals into a Neutron content-script worker on demand.
 *
 * Differences vs the per-frame `devtools-agent`:
 *   - Targets a Web Worker realm (no DOM). Pre-shims `window` for
 *     chobitsu's DOMDebugger to survive module load.
 *   - Uses raw `self.postMessage` transport (no scramjet envelope).
 *
 * Output: dist/devtools-worker-agent.js. Loaded by the host via
 * fetch() at runtime, shipped to the worker through a worker-attach
 * message, evaluated in the worker's realm.
 */

import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	input: resolve(configDir, 'index.ts'),
	platform: 'browser',
	output: {
		file: resolve(configDir, 'dist', 'devtools-worker-agent.js'),
		format: 'iife',
		minify: true,
	},
});
