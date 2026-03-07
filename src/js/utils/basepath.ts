/**
 * Runtime base path detection for arbitrary subpath deployments.
 *
 * The base path is set by an inline <script> in every HTML entry point
 * (root index.html + each internal page) BEFORE any modules load:
 *
 *   self.__ddxBase = (function() {
 *     var p = location.pathname;
 *     var i = p.indexOf('/internal/');
 *     if (i !== -1) return p.substring(0, i + 1);
 *     return new URL('./', location.href).pathname;
 *   })();
 *
 * In the service worker, it is set as:
 *   self.__ddxBase = self.location.pathname.replace(/[^/]*$/, '');
 *
 * This module reads that global and exports helpers so TS code never
 * needs to hardcode absolute paths.
 */

declare global {
  var __ddxBase: string | undefined;
}

/** The deployment base path, always ends with '/'. Defaults to '/' when unset. */
export const basePath: string = globalThis.__ddxBase || "/";

/**
 * Resolve an absolute-looking path (e.g. "/api/results/foo") against
 * the runtime base so it works at any deployment subpath.
 *
 * resolvePath("/api/results/foo") => "/myapp/api/results/foo"
 * resolvePath("api/results/foo")  => "/myapp/api/results/foo"
 */
export function resolvePath(path: string): string {
  return basePath + path.replace(/^\//, "");
}
