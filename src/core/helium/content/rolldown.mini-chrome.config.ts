// src/core/helium/content/rolldown.mini-chrome.config.ts
/**
 * Builds the helium-mini-chrome IIFE bundle that runs in every
 * Helium-instrumented proxied page. Bundles mini-chrome.ts plus its
 * transitive imports (mini-chrome-instance, isolation/, ctx-encode).
 *
 * Includes a custom plugin to handle `?raw` imports because rolldown
 * v1.0.2 doesn't natively support Vite's `?raw` query suffix. The
 * plugin reads matching files via fs.readFileSync at build time and
 * exposes them as default-exported string literals.
 */

import { defineConfig } from 'rolldown';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

const rawImportPlugin = {
  name: 'helium-raw-import',
  resolveId(id: string, importer: string | undefined): string | null {
    if (!id.endsWith('?raw')) return null;
    const cleaned = id.slice(0, -'?raw'.length);
    const base = importer ? dirname(importer) : configDir;
    const abs = resolve(base, cleaned);
    return abs + '?raw';
  },
  load(id: string): { code: string } | null {
    if (!id.endsWith('?raw')) return null;
    const abs = id.slice(0, -'?raw'.length);
    const contents = readFileSync(abs, 'utf-8');
    return { code: `export default ${JSON.stringify(contents)};` };
  },
};

export default defineConfig({
  input: resolve(configDir, 'mini-chrome.ts'),
  platform: 'browser',
  plugins: [rawImportPlugin],
  output: {
    file: resolve(configDir, 'dist', 'mini-chrome.js'),
    format: 'iife',
    name: 'HeliumMiniChrome',
    extend: true,
    minify: true,
    sourcemap: false,
  },
});
