import type { ExtensionContext } from '../extfs/types';
import { serializeCtxForMeta } from './ctx-encode';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Build the synthetic entry HTML served at `__helium_entry__`.
 *
 * `scriptTags` is the rendered `<script>` markup for each of the
 * manifest's background scripts (or service_worker). The bootstrap
 * IIFE always loads first; extension scripts follow.
 *
 * For MV2 `background.page`, this function is NOT used — the page
 * is fetched from TFS and rewritten via injectBootstrapIntoBackgroundPage.
 */
export function buildEntryHtml(
  ctx: ExtensionContext,
  scriptTags: string[],
): string {
  const ctxB64 = serializeCtxForMeta(ctx);
  const title = `Helium: ${escapeHtml(ctx.manifest.name)}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="helium-ctx" content="${escapeAttr(ctxB64)}">
  <title>${title}</title>
  <script src="__helium_bootstrap__.js"></script>
${scriptTags.map(s => `  ${s}`).join('\n')}
</head>
<body></body>
</html>`;
}

/**
 * Rewrite an extension-provided HTML background page to inject the
 * helium-ctx meta tag and the bootstrap script as the first two
 * entries in <head>.
 *
 * If <head> is absent (some pages start with <body> directly), prepend
 * a synthetic <head> containing the injected entries.
 */
export function injectBootstrapIntoBackgroundPage(
  html: string,
  ctx: ExtensionContext,
): string {
  const ctxB64 = serializeCtxForMeta(ctx);
  const injected =
    `<meta name="helium-ctx" content="${escapeAttr(ctxB64)}">\n` +
    `<script src="__helium_bootstrap__.js"></script>\n`;

  const headOpenRe = /<head\b[^>]*>/i;
  if (headOpenRe.test(html)) {
    return html.replace(headOpenRe, match => `${match}\n${injected}`);
  }

  const htmlOpenRe = /<html\b[^>]*>/i;
  const synthHead = `<head>\n${injected}</head>\n`;
  if (htmlOpenRe.test(html)) {
    return html.replace(htmlOpenRe, match => `${match}\n${synthHead}`);
  }
  return synthHead + html;
}
