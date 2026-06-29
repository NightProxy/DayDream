import type { Plugin, ResolvedConfig } from "vite";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";

/**
 * Vite's MPA mode emits HTML inputs at paths that mirror the source
 * directory under `dist/`. Inputs like `src/pages/newtab/index.html`
 * land at `dist/src/pages/newtab/index.html` regardless of the
 * `rollupOptions.input` map keys (`internal/newtab/index`).
 *
 * The DDX app contracts on `/internal/<page>/` URLs everywhere
 * (see `__ddxBase` bootstrap in each page's HTML head, and the dev
 * `prettyUrlsPlugin` rewrites). It also assumes page HTML is emitted
 * at depth 2 — manual asset refs like `../../res/logo.png` only
 * resolve correctly when the file is at `dist/internal/<page>/`.
 *
 * This plugin runs at `closeBundle` and:
 *   1. Moves `dist/src/pages/<name>/index.html` → `dist/internal/<name>/index.html`
 *   2. Rewrites Vite-bundled asset refs from `../../../foo` → `../../foo`
 *      (depth 3 → 2; manual `../../res/...` refs were already correct
 *      for depth 2, so they aren't touched)
 *   3. Removes the now-empty `dist/src/` tree
 *
 * After this runs, `dist/internal/error/index.html` exists, which is
 * what `srv/router.ts:setNotFoundHandler` expects when serving 404s.
 */
export function relocatePagesPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: "ddx-relocate-pages",
    apply: "build",
    enforce: "post",

    configResolved(c) {
      config = c;
    },

    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const sourcePages = join(outDir, "src", "pages");
      const targetInternal = join(outDir, "internal");

      if (!existsSync(sourcePages)) return;

      const entries = readdirSync(sourcePages, { withFileTypes: true });
      const moved: string[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const srcHtml = join(sourcePages, entry.name, "index.html");
        if (!existsSync(srcHtml)) continue;

        const destDir = join(targetInternal, entry.name);
        mkdirSync(destDir, { recursive: true });

        const destHtml = join(destDir, "index.html");
        const html = readFileSync(srcHtml, "utf-8");

        // Vite emitted the page at depth 3 (dist/src/pages/<name>/)
        // and prefixed bundled-asset refs with `../../../`. After
        // moving to depth 2 (dist/internal/<name>/), those refs need
        // one fewer `../`. Be conservative: only rewrite triple-dot
        // prefixes that immediately precede a bundled-output path.
        const rewritten = html.replace(
          /\.\.\/\.\.\/\.\.\/((?:assets|chunks|src)\/|[a-z0-9]{6,}\.(?:js|css|map)(?![a-z0-9]))/gi,
          "../../$1",
        );

        writeFileSync(destHtml, rewritten, "utf-8");
        moved.push(entry.name);
      }

      // Drop the now-redundant dist/src tree. We can't trust that
      // *nothing* else lives there (custom output paths, vite copy
      // targets, etc.) but in practice DDX only emits HTML there, so
      // removing it is safe and keeps the served tree tidy.
      const distSrc = join(outDir, "src");
      if (existsSync(distSrc)) {
        rmSync(distSrc, { recursive: true, force: true });
      }

      if (moved.length > 0) {
        console.log(
          `\x1b[36m  Relocated ${moved.length} page(s) to dist/internal/: ${moved.join(", ")}\x1b[0m`,
        );
      }
    },
  };
}
