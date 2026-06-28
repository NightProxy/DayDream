/**
 * Extension-aware MIME table. Covers the extension types Chrome
 * extensions actually ship. Unknown extensions get
 * `application/octet-stream`.
 */

const TABLE: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.htm':   'text/html; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.mjs':   'text/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.wasm':  'application/wasm',
  '.txt':   'text/plain; charset=utf-8',
};

const DEFAULT_TYPE = 'application/octet-stream';

export function contentTypeFromPath(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return DEFAULT_TYPE;
  const ext = path.slice(dot).toLowerCase();
  return TABLE[ext] ?? DEFAULT_TYPE;
}
