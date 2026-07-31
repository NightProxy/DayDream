import type { Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

interface TerbiumConfig {
  'pkg-name': string;
  'display-name': string;
  developer?: string;
  wmArgs: Record<string, any>;
}

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  terbium?: TerbiumConfig;
}

/**
 * Runtime `.tbconfig` shape — written to the root of the TAPP zip.
 * Terbium's installer reads this on `tb.launcher.addApp` /
 * marketplace install to know how to launch the app.
 *
 * The tb-repo *catalog* entry (separate from this file) is a different
 * shape entirely — see the "Formatting TAPPs" section of
 * https://github.com/TerbiumOS/web-v2/blob/dev/docs/creating-apps.md.
 * That entry holds `pkg-download`, `developer`, `description`, etc. and
 * is irrelevant to the runtime install: it lives in tb-repo, not in
 * the zip we produce here.
 */
export interface TbConfig {
  title: string;
  icon: string;
  wmArgs: Record<string, any>;
}

/**
 * Build the runtime `.tbconfig` from a parsed package.json.
 *
 * Throws if package.json is missing the version, terbium block, or
 * terbium.pkg-name. (Version isn't written into .tbconfig — Terbium's
 * runtime doesn't read it — but we require it on package.json so the
 * project stays version-tracked and so a future tb-repo manifest
 * generator has the data to hand.)
 */
export function buildManifest(pkg: PackageJson): TbConfig {
  if (!pkg.version) {
    throw new Error('[terbium-tapp] package.json is missing "version"');
  }
  if (!pkg.terbium) {
    throw new Error('[terbium-tapp] package.json is missing the "terbium" config block');
  }
  if (!pkg.terbium['pkg-name']) {
    throw new Error('[terbium-tapp] package.json terbium["pkg-name"] is required');
  }

  const title = pkg.terbium['display-name'] || pkg.name;
  const appId = `com.tb.${pkg.terbium['pkg-name']}`;

  return {
    title,
    icon: './icon.png',
    wmArgs: {
      ...pkg.terbium.wmArgs,
      icon: './icon.png',
      src: './index.html',
      app_id: appId,
    },
  };
}

/**
 * Vite plugin: activates when `vite build --mode tapp`.
 *
 * - Generates dist/.tbconfig from package.json (Terbium runtime config)
 * - Copies public/res/logo.png → dist/icon.png
 * - Injects <script src="./terbium/boot.js"> as the FIRST <script> in <head>
 *
 * The src/terbium/*.ts shims are built separately via `pnpm terbium:build`
 * (rolldown) AFTER this plugin runs, then the standalone
 * `srv/vite/terbium-tapp-pack.ts` script zips everything as
 * dist-tapp/<pkg-name>.TAPP.zip. Splitting prevents vite's emptyOutDir
 * from wiping the shims between phases.
 */
export function terbiumTappPlugin(): Plugin {
  let isTappMode = false;
  let pkg: PackageJson;
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

  return {
    name: 'terbium-tapp',

    config(_config, env) {
      isTappMode = env.mode === 'tapp';
      if (!isTappMode) return;
      pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
      // Validate up-front so misconfig fails fast
      buildManifest(pkg);
      return {
        define: {
          'import.meta.env.TAPP': JSON.stringify(true),
        },
      };
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!isTappMode) return html;
        // Inject boot.js as the FIRST <script> tag in <head>.
        // Order matters: boot.ts must run before Daydream's Proxy is constructed.
        return html.replace(
          /<head>/i,
          '<head>\n\t\t<script src="./terbium/boot.js"></script>',
        );
      },
    },

    writeBundle() {
      if (!isTappMode) return;

      const outDir = resolve(rootDir, 'dist');
      const tbconfig = buildManifest(pkg);
      writeFileSync(
        resolve(outDir, '.tbconfig'),
        JSON.stringify(tbconfig, null, 2),
        'utf-8',
      );
      console.log('[terbium-tapp] wrote dist/.tbconfig');

      const logoSrc = resolve(rootDir, 'public/res/logo.png');
      const logoDst = resolve(outDir, 'icon.png');
      if (!existsSync(logoSrc)) {
        throw new Error(
          `[terbium-tapp] icon source not found: ${logoSrc} — required for TAPP build`,
        );
      }
      copyFileSync(logoSrc, logoDst);
      console.log('[terbium-tapp] copied icon.png from public/res/logo.png');
    },
  };
}
