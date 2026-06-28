/**
 * Inlines the helium-bootstrap.js IIFE bundle as a raw string so the
 * extfs plugin can serve it directly from memory (no fetch, no SW
 * dependency).
 *
 * The bundle is built by rolldown via the
 * `npm run helium-bootstrap:build` script (wired into `npm run build`).
 * Until that build runs, dist/helium-bootstrap.js doesn't exist and
 * this import fails — Task 8 implements client.ts and Task 12 runs
 * the build, after which this file resolves.
 */

// `?raw` is handled by Vite/rolldown. The wildcard module
// declaration in src/types/raw-imports.d.ts gives this import a
// `string` type even before dist/helium-bootstrap.js is built.
// At runtime the import resolves once the bundle build has run
// (npm run helium-bootstrap:build, wired into npm run build).
import bootstrapSrc from './dist/helium-bootstrap.js?raw';
export { bootstrapSrc };
