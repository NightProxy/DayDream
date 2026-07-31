/**
 * TFS path helpers for the extension store. Single source of truth
 * for the `/extensions/<id>/<rel>` layout.
 */

export const EXT_ROOT = '/extensions';
export const INDEX_PATH = `${EXT_ROOT}/_index.json`;

/**
 * Compose the full TFS path for a file inside an extension's tree.
 * Strips leading slashes from `rel` to keep the join clean.
 */
export function extPath(id: string, rel: string): string {
  const normalized = rel.replace(/^\/+/, '');
  return `${EXT_ROOT}/${id}/${normalized}`;
}

/**
 * Returns the directory containing the given path, or '/' for
 * top-level paths. Mirrors Node's `path.dirname` for POSIX paths.
 */
export function dirname(path: string): string {
  if (path === '/' || path === '') return '/';
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return '/';
  return path.slice(0, idx);
}

/**
 * Validate and normalize a path inside an extension's own tree.
 *
 * Accepts:  `foo/bar.html`, `/foo/bar.html`, `dir/sub/file.js`
 * Rejects:  empty, `.`, `..`, `foo//bar`, `foo/\x00bar`, anything
 *           with a `..` or `.` segment.
 *
 * Returns the normalized form (no leading slash, forward slashes
 * only) or `null` for any rejection. Defense in depth on top of
 * the unpacker's existing path traversal guard.
 */
export function normalizeExtPath(rawPath: string): string | null {
  const stripped = rawPath.replace(/^\/+/, '');
  if (stripped === '') return null;
  const parts = stripped.split('/');
  for (const p of parts) {
    if (p === '..' || p === '.') return null;
    if (p === '') return null;
    if (p.includes('\0')) return null;
  }
  return parts.join('/');
}
