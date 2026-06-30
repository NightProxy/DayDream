#!/usr/bin/env node
/**
 * Standalone Node script: package dist/ as dist-tapp/<pkg-name>.TAPP.zip.
 *
 * Run AFTER `vite build --mode tapp` and `pnpm run terbium:build` so that
 * dist/ contains the full Daydream build, the generated manifest.json,
 * the copied icon.png, and the dist/terbium/*.js shim bundles.
 *
 * Invoked by the `build:tapp` package script.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { zipSync } from 'fflate';
import { collectFiles } from './terbium-tapp-zip';
import { buildManifest } from './terbium-tapp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = resolve(ROOT, 'dist');
const OUT_DIR = resolve(ROOT, 'dist-tapp');

function main(): void {
	const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
	const manifest = buildManifest(pkg);

	// Verify prerequisites
	const requiredArtifacts = [
		resolve(DIST, 'manifest.json'),
		resolve(DIST, 'icon.png'),
		resolve(DIST, 'index.html'),
		resolve(DIST, 'terbium/boot.js'),
		resolve(DIST, 'terbium/downloads.js'),
		resolve(DIST, 'terbium/island.js')
	];
	const missing = requiredArtifacts.filter(p => !existsSync(p));
	if (missing.length > 0) {
		console.error('[terbium-tapp-pack] missing required artifacts:');
		for (const p of missing) console.error('  -', p);
		console.error(
			'\nRun the prerequisites first:\n' +
				'  1. pnpm run build              (main Daydream build)\n' +
				'  2. vite build --mode tapp      (generates manifest, copies icon, injects boot.js)\n' +
				'  3. pnpm run terbium:build      (builds dist/terbium/*.js)\n' +
				'Then re-run this script.'
		);
		process.exit(1);
	}

	mkdirSync(OUT_DIR, { recursive: true });
	const fileMap = collectFiles(DIST);
	const zipped = zipSync(fileMap, { level: 6 });

	const zipName = `${manifest['pkg-name']}.TAPP.zip`;
	const zipPath = resolve(OUT_DIR, zipName);
	writeFileSync(zipPath, zipped);
	console.log(
		`[terbium-tapp-pack] wrote ${zipPath} (${zipped.byteLength} bytes, ` +
			`${Object.keys(fileMap).length} files)`
	);
}

main();
