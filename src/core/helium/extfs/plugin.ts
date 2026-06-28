import {
  bootstrapSrc,
  buildEntryHtml,
  injectBootstrapIntoBackgroundPage,
} from '../bootstrap';
import { getCachedI18n, prepareI18nFor } from '../host/i18n';
import { readExtensionFile } from './install';
import { contentTypeFromPath } from './mime';
import { normalizeExtPath } from './path';
import { compileHostPatterns, isAllowedExternalOrigin } from './policy';
import type { ExtensionContext } from './types';
import { isAccessible } from './war';

function escapeAttrSafe(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

interface PluginOpts {
  /**
   * If true (default), outbound fetches from inside the frame are
   * filtered against the extension's `host_permissions` /
   * `externally_connectable.ids`. Off-by-default would be a
   * footgun.
   */
  enforceHostPolicy?: boolean;
  /**
   * Per-iframe overrides merged into the ExtensionContext that is
   * serialized into `<meta name="helium-ctx">`. Used by
   * DevtoolsPageHost to mark devtools_page iframes with
   * `inDevtools: true` (surfaces `chrome.devtools.*`) and to bake in
   * the inspected tabId so `chrome.devtools.inspectedWindow.tabId`
   * is a synchronous read. The underlying ctx (id, manifest, origin)
   * is never overridden — only the optional transport flags are.
   */
  ctxOverrides?: Pick<ExtensionContext, 'inDevtools' | 'inspectedTabId'>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    statusText: status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : '',
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * File extensions we treat as "extension-authored UI content" that
 * should be:
 *   1. Localized via __MSG_*__ substitution.
 *   2. (HTML only) have the bootstrap + helium-ctx meta tag injected.
 *
 * Chrome's i18n preprocessor runs on HTML, CSS, and JSON (the manifest
 * itself is special-cased). We match the same surface area.
 */
function isHtml(rel: string): boolean {
  return /\.html?$/i.test(rel);
}
function isCss(rel: string): boolean {
  return /\.css$/i.test(rel);
}
function isJson(rel: string): boolean {
  return /\.json$/i.test(rel);
}

/**
 * Apply Chrome's `__MSG_<key>__` substitution to a string.
 *
 * Behaviour matches Chrome:
 *   - Unknown keys are left as-is (so they're visible during development).
 *   - Keys can contain letters, digits, underscores, and `@`.
 *   - Placeholders / $1-$9 substitution don't apply here — those only
 *     apply to runtime `chrome.i18n.getMessage(key, subs)` calls.
 *     `__MSG_*__` in static files is always the bare message text.
 */
function substituteMsgPlaceholders(
  body: string,
  messages: Record<string, { message: string }>,
): string {
  return body.replace(/__MSG_([A-Za-z0-9_@]+)__/g, (whole, key) => {
    const entry = messages[key];
    return entry ? entry.message : whole;
  });
}

/**
 * Per-frame Scramjet plugin that serves the extension's static
 * files under its synthetic origin and enforces a deny-by-default
 * host-access policy for outbound fetches.
 *
 * Typical usage (from the next sub-project's context-spawning
 * layer):
 *
 *   const ctx: ExtensionContext = { ... };
 *   const plugin = new HeliumExtensionPlugin(ctx);
 *   const frame = await proxy.createFrame(element, {
 *     plugins: [plugin],
 *   });
 *   await frame.go(`https://${ctx.origin}/index.html`);
 *
 * The plugin reads `globalThis.$scramjet.Plugin` lazily inside
 * `install()`, so it has no static dependency on the Scramjet
 * runtime and is safe to import from any context.
 */
export class HeliumExtensionPlugin {
  // Scramjet's controller.createFrame iterates plugin.dependencies
  // (controller/src/index.ts:821). These fields satisfy the ManagedPlugin
  // contract without extending the class (we can't — $scramjet.Plugin is
  // not available at module-load time).
  public readonly name: string;
  public readonly dependencies: string[] = [];

  /**
   * The base ExtensionContext as serialized into `<meta name="helium-ctx">`.
   * If the caller passed ctxOverrides, this is the merged context;
   * otherwise it's identical to the original ctx. All routing /
   * host-policy decisions still use ctx.id, ctx.origin, ctx.manifest —
   * the overrides only carry transport flags consumed by the
   * bootstrap (currently: inDevtools).
   *
   * NOTE: the i18n fields (`i18nLocale`, `i18nMessages`) are NOT stored
   * on this baseline. They are spliced in just-in-time inside
   * `enrichCtxForMeta()` so different iframes for the same extension
   * can theoretically negotiate to different locales (we don't do that
   * today, but the architecture allows it).
   */
  private readonly ctx: ExtensionContext;
  private readonly enforceHostPolicy: boolean;
  private readonly hostPatterns: string[];
  private inner: any = null;

  constructor(ctx: ExtensionContext, opts: PluginOpts = {}) {
    this.name = `helium-${ctx.id}`;
    // Merge overrides into the on-wire ctx. We never let an override
    // touch id / manifest / origin — only the optional transport flags.
    const overrides = opts.ctxOverrides;
    if (overrides) {
      let merged: ExtensionContext = ctx;
      if (overrides.inDevtools === true) merged = { ...merged, inDevtools: true };
      if (typeof overrides.inspectedTabId === 'number') {
        merged = { ...merged, inspectedTabId: overrides.inspectedTabId };
      }
      this.ctx = merged;
    } else {
      this.ctx = ctx;
    }
    this.enforceHostPolicy = opts.enforceHostPolicy ?? true;
    this.hostPatterns = compileHostPatterns(ctx.manifest);

    // Eagerly kick off locale negotiation + messages.json load. The
    // first HTML/CSS/JSON request for this extension will then have
    // the i18n payload in-cache. If this fails we fall back to an
    // empty message map — the extension just sees `__MSG_*__` literals
    // (same as Chrome behaviour for missing _locales/).
    void prepareI18nFor(ctx.id, (ctx.manifest as { default_locale?: string }).default_locale)
      .catch((err) => {
        console.warn('[helium/extfs] prepareI18nFor failed for', ctx.id, err);
      });
  }

  /**
   * Build the on-wire ExtensionContext for `<meta name="helium-ctx">`.
   * Splices in the cached i18n state so the bootstrap can resolve
   * `chrome.i18n.getMessage` synchronously.
   *
   * If i18n hasn't finished loading yet (the eager preload in the
   * constructor is best-effort), we wait for it here. The result is
   * cached after the first await so subsequent calls are zero-RTT.
   */
  private async enrichCtxForMeta(): Promise<ExtensionContext> {
    // Cheap path: prepared, just splice it in.
    const cached = getCachedI18n(this.ctx.id);
    if (cached) {
      return { ...this.ctx, i18nLocale: cached.locale, i18nMessages: cached.messages };
    }
    // First request raced ahead of the constructor preload — await it.
    try {
      const prepared = await prepareI18nFor(
        this.ctx.id,
        (this.ctx.manifest as { default_locale?: string }).default_locale,
      );
      return { ...this.ctx, i18nLocale: prepared.locale, i18nMessages: prepared.messages };
    } catch {
      return { ...this.ctx, i18nLocale: null, i18nMessages: {} };
    }
  }

  /**
   * Called by Scramjet (or by `proxy.createFrame({ plugins: [...] })`)
   * when the frame is ready. Taps `frame.hooks.fetch.request`.
   */
  install(frame: any): void {
    const Plugin = (globalThis as any).$scramjet?.Plugin;
    if (!Plugin) {
      throw new Error(
        '[helium/extfs] $scramjet not initialised when HeliumExtensionPlugin.install() called',
      );
    }
    if (!this.inner) this.inner = new Plugin(`helium-${this.ctx.id}`);
    this.inner.tap(
      frame.hooks.fetch.request,
      async (context: any, props: any) => {
        await this.handle(context, props);
      },
    );
  }

  private async handle(context: any, props: any): Promise<void> {
    const url: URL | undefined = context.parsed?.url;
    if (!url) return;

    // 1. Our own origin → serve files.
    if (url.host === this.ctx.origin) {
      await this.serveFile(url, context, props);
      return;
    }

    // 2. External: deny-by-default policy.
    if (!this.enforceHostPolicy) return;
    if (isAllowedExternalOrigin(url, this.ctx, this.hostPatterns)) return;

    props.earlyResponse = textResponse(
      403,
      `Forbidden: ${url.host} not in extension policy`,
    );
  }

  private async serveFile(url: URL, context: any, props: any): Promise<void> {
    const method = context.request?.method;
    if (method !== 'GET' && method !== 'HEAD') return;

    const rel = normalizeExtPath(url.pathname);
    if (rel === null) {
      props.earlyResponse = textResponse(403, 'Forbidden (invalid path)');
      return;
    }

    // Synthetic path: bootstrap IIFE bundle.
    if (rel === '__helium_bootstrap__.js') {
      props.earlyResponse = new Response(bootstrapSrc, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
      return;
    }

    // Synthetic path: entry HTML for MV2 background.scripts or MV3
    // background.service_worker.
    if (rel === '__helium_entry__' || rel === '__helium_entry__.html') {
      const ctxWithI18n = await this.enrichCtxForMeta();
      const html = buildEntryHtml(ctxWithI18n, this.collectScriptTags());
      props.earlyResponse = new Response(html, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
      return;
    }

    if (!isAccessible(rel, context, this.ctx)) {
      props.earlyResponse = textResponse(
        403,
        'Forbidden (not in web_accessible_resources)',
      );
      return;
    }

    const bytes = await readExtensionFile(this.ctx.id, rel);
    if (!bytes) {
      props.earlyResponse = textResponse(404, `Not Found: ${rel}`);
      return;
    }

    // HEAD requests: send headers only.
    if (method === 'HEAD') {
      props.earlyResponse = new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': contentTypeFromPath(rel),
          'cache-control': 'no-store',
        },
      });
      return;
    }

    // Any extension-authored HTML, CSS, or JSON needs the i18n
    // preprocessor pass (per Chrome's contract — `__MSG_*__`
    // substitution happens at file-serve time, not at runtime).
    //
    // HTML additionally gets the bootstrap + helium-ctx injected, so
    // the page can construct `chrome.*` and talk to the host. This
    // covers popups, options pages, devtools_pages, and any other
    // HTML page the extension serves — NOT just the bg.page.
    //
    // For the bg.page case specifically, the BG iframe's iframe.src
    // points at the file directly; for popup/options the same
    // codepath now does the same work.
    const isLocalizable = isHtml(rel) || isCss(rel) || isJson(rel);
    if (isLocalizable) {
      const ctxWithI18n = await this.enrichCtxForMeta();
      const messages = ctxWithI18n.i18nMessages ?? {};
      let body = new TextDecoder().decode(bytes);

      // __MSG_*__ substitution applies to all three types.
      body = substituteMsgPlaceholders(body, messages);

      // HTML additionally gets bootstrap injection.
      if (isHtml(rel)) {
        body = injectBootstrapIntoBackgroundPage(body, ctxWithI18n);
      }

      props.earlyResponse = new Response(body, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': contentTypeFromPath(rel),
          'cache-control': 'no-store',
        },
      });
      return;
    }

    // Fall-through: serve raw bytes. JS, images, fonts, binary
    // assets. We do NOT inject anything into JS — the bootstrap
    // already loaded and runs FIRST in any HTML container, and the
    // extension's own scripts depend on `chrome` already being
    // present by the time they execute (which is what
    // injectBootstrapIntoBackgroundPage guarantees for the HTML
    // entry).
    props.earlyResponse = new Response(toArrayBuffer(bytes), {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': contentTypeFromPath(rel),
        'cache-control': 'no-store',
      },
    });
  }

  private collectScriptTags(): string[] {
    const m: any = this.ctx.manifest;
    const bg = m.background;
    if (!bg) return [];
    if (Array.isArray(bg.scripts)) {
      return bg.scripts.map(
        (s: string) => `<script src="${escapeAttrSafe(s)}"></script>`,
      );
    }
    if (typeof bg.service_worker === 'string') {
      const t = bg.type === 'module' ? ' type="module"' : '';
      return [
        `<script${t} src="${escapeAttrSafe(bg.service_worker)}"></script>`,
      ];
    }
    return [];
  }
}
