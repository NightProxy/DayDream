// src/core/helium/content/rolldown.neutron-worker.config.ts
/**
 * Builds the neutron-worker IIFE bundle that runs inside the Worker
 * spawned per ISOLATED-mode content script. Bundles
 * isolation/neutron-worker-source.ts plus its transitive imports
 * (neutron/worker, dom-proxy).
 */

import { defineConfig } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  input: resolve(configDir, 'isolation', 'neutron-worker-source.ts'),
  platform: 'browser',
  output: {
    file: resolve(configDir, 'dist', 'neutron-worker.js'),
    format: 'iife',
    name: 'HeliumNeutronWorker',
    extend: true,
    minify: true,
    sourcemap: false,
  },
});
