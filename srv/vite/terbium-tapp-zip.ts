// srv/vite/terbium-tapp-zip.ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, relative, sep } from 'path';

/**
 * Recursively walk `rootDir` and return a `{ relPath: Uint8Array }` map
 * suitable for fflate.zipSync. Skips nothing — caller is responsible for
 * pointing this at a clean output directory.
 */
export function collectFiles(rootDir: string): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        // Use forward slashes for zip-path compatibility across platforms
        const rel = relative(rootDir, full).split(sep).join('/');
        out[rel] = new Uint8Array(readFileSync(full));
      }
    }
  };
  walk(rootDir);
  return out;
}
