/**
 * chrome.scripting.* handler implementations. Wired into
 * ExtensionManager.handlerImpls() in Task 20.
 *
 * Note: there's a SEPARATE `scripting.*` handler set in
 * src/apis/nyxBridge/handlers/scripting.ts used by Tabby and other
 * non-extension callers. Helium does NOT delegate to it because:
 *   - Helium handlers need access to the calling ExtensionContext
 *     (manifest, origin, FS) to read extension-relative files and
 *     produce wrappers with correct scriptKeys.
 *   - The Helium injector & dynamic-registration model uses
 *     scriptInjectionRegistry directly; nyx's scripting.* handlers
 *     don't manage that registry.
 * Both surfaces coexist; this is the extension-callable surface.
 *
 * v1 coverage:
 *   - executeScript({ target: {tabId}, files | func, args, world })
 *   - insertCSS({ target: {tabId}, css | files })
 *   - removeCSS({ target: {tabId}, css | files })
 *   - registerContentScripts(scripts) — add to dynamicRegistrations + reapply
 *   - unregisterContentScripts(filter) — remove + reapply
 *   - getRegisteredContentScripts(filter) — return matching dynamic regs
 *
 * Target tab → window lookup uses NyxBridge's tabResolver via the
 * NyxHandlerContext stored on ExtensionManager.
 */

import type { HandlerContext as NyxHandlerContext } from '@apis/nyxBridge/handlers';

import { readExtensionFile } from '../extfs/install';
import type { ExtensionContext } from '../extfs/types';
import type { ContentScriptRule } from '../shared/unpack/types';

import {
  addDynamicRegistration,
  getDynamicRegistrations,
  installContentScripts,
  removeDynamicRegistration,
  uninstallContentScripts,
} from './injector';
import type { ContentScriptRelay } from './relay';
import { buildCssWrapper, buildJsWrapper } from './wrapper';

export interface ScriptingDeps {
  nyxCtx: NyxHandlerContext;
  relay: ContentScriptRelay;
}

export class ScriptingHandlers {
  constructor(private deps: ScriptingDeps) {}

  async executeScript(ctx: ExtensionContext, args: unknown[]): Promise<unknown> {
    const opts = (args[0] ?? {}) as {
      target?: { tabId?: number; allFrames?: boolean };
      files?: string[];
      func?: ((...a: unknown[]) => unknown) | string;
      args?: unknown[];
      world?: 'MAIN' | 'ISOLATED';
    };
    const tabId = opts.target?.tabId;
    if (typeof tabId !== 'number') {
      throw new Error('executeScript requires target.tabId');
    }
    const iframe = this.deps.nyxCtx.tabResolver.resolveIframe(tabId);
    const win = iframe.contentWindow as Window | null;
    if (!win) throw new Error(`Tab ${tabId} not found or has no contentWindow`);

    const world: 'MAIN' | 'ISOLATED' = opts.world ?? 'ISOLATED';
    if (opts.files && opts.files.length > 0) {
      return this.injectFiles(ctx, win, opts.files, world);
    }
    if (opts.func) {
      const fnSrc =
        typeof opts.func === 'string' ? opts.func : opts.func.toString();
      return this.injectFunc(ctx, win, fnSrc, opts.args ?? [], world);
    }
    throw new Error('executeScript requires `files` or `func`');
  }

  private async injectFiles(
    ctx: ExtensionContext,
    win: Window,
    files: string[],
    world: 'MAIN' | 'ISOLATED',
  ): Promise<unknown> {
    for (let i = 0; i < files.length; i++) {
      const bytes = await readExtensionFile(ctx.id, files[i]!);
      if (!bytes) continue;
      const code = buildJsWrapper({
        extId: ctx.id,
        ctx,
        scriptBody: new TextDecoder().decode(bytes),
        runAt: 'document_idle',
        world,
        topFrameOnly: false,
        scriptKey: `${ctx.id}:exec:files${i}:${Date.now()}`,
      });
      try {
        (win as any).eval(code);
      } catch (err) {
        console.warn(
          '[helium/content/scripting] executeScript inject failed:',
          err,
        );
      }
    }
    return [{ result: undefined, frameId: 0 }];
  }

  private async injectFunc(
    ctx: ExtensionContext,
    win: Window,
    fnSrc: string,
    fnArgs: unknown[],
    world: 'MAIN' | 'ISOLATED',
  ): Promise<unknown> {
    const body = `var __args__ = ${JSON.stringify(fnArgs)};
return (${fnSrc}).apply(null, __args__);`;
    const wrapped = buildJsWrapper({
      extId: ctx.id,
      ctx,
      scriptBody: body,
      runAt: 'document_idle',
      world,
      topFrameOnly: false,
      scriptKey: `${ctx.id}:exec:func:${Date.now()}`,
    });
    try {
      (win as any).eval(wrapped);
    } catch (err) {
      console.warn(
        '[helium/content/scripting] executeScript func inject failed:',
        err,
      );
    }
    return [{ result: undefined, frameId: 0 }];
  }

  async insertCSS(ctx: ExtensionContext, args: unknown[]): Promise<void> {
    const opts = (args[0] ?? {}) as {
      target?: { tabId?: number };
      css?: string;
      files?: string[];
    };
    const tabId = opts.target?.tabId;
    if (typeof tabId !== 'number') {
      throw new Error('insertCSS requires target.tabId');
    }
    const iframe = this.deps.nyxCtx.tabResolver.resolveIframe(tabId);
    const win = iframe.contentWindow as Window | null;
    if (!win) throw new Error(`Tab ${tabId} not found`);

    let css = opts.css ?? '';
    if (Array.isArray(opts.files) && opts.files.length > 0) {
      for (const file of opts.files) {
        try {
          const bytes = await readExtensionFile(ctx.id, file);
          if (bytes) {
            css += (css ? '\n' : '') + new TextDecoder().decode(bytes);
          } else {
            console.warn('[helium/content/scripting] insertCSS file missing:', file);
          }
        } catch (err) {
          console.warn('[helium/content/scripting] insertCSS file read failed:', file, err);
        }
      }
    }
    if (!css) return;
    const code = buildCssWrapper({
      extId: ctx.id,
      cssText: css,
      runAt: 'document_idle',
      topFrameOnly: false,
    });
    try {
      (win as any).eval(code);
    } catch (err) {
      console.warn(err);
    }
  }

  async removeCSS(ctx: ExtensionContext, args: unknown[]): Promise<void> {
    const opts = (args[0] ?? {}) as {
      target?: { tabId?: number };
      css?: string;
      files?: string[];
    };
    const tabId = opts.target?.tabId;
    if (typeof tabId !== 'number') {
      throw new Error('removeCSS requires target.tabId');
    }
    const iframe = this.deps.nyxCtx.tabResolver.resolveIframe(tabId);
    const win = iframe.contentWindow as Window | null;
    if (!win) return;
    let targetCss: string | undefined;
    if (typeof opts.css === 'string' && opts.css.length > 0) {
      targetCss = opts.css;
    }
    if (Array.isArray(opts.files) && opts.files.length > 0) {
      let acc = targetCss ?? '';
      for (const file of opts.files) {
        try {
          const bytes = await readExtensionFile(ctx.id, file);
          if (bytes) acc += (acc ? '\n' : '') + new TextDecoder().decode(bytes);
        } catch { /* skip */ }
      }
      if (acc) targetCss = acc;
    }
    const idForCss = ctx.id.replace(/[^A-Za-z0-9_-]/g, '');
    const cssLit = targetCss !== undefined ? JSON.stringify(targetCss) : 'null';
    try {
      (win as any).eval(`(function(){
        var sel = 'style[data-helium-content-css="${idForCss}"]';
        var match = ${cssLit};
        Array.from(document.querySelectorAll(sel)).forEach(function(el) {
          if (match === null || el.textContent === match) el.remove();
        });
      })();`);
    } catch (err) {
      console.warn(err);
    }
  }

  async registerContentScripts(
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> {
    const scripts = (args[0] ?? []) as Array<{ id: string } & ContentScriptRule>;
    for (const s of scripts) {
      if (!s.id) {
        throw new Error('registerContentScripts requires id on each entry');
      }
      addDynamicRegistration(ctx.id, s.id, s);
    }
    uninstallContentScripts(ctx.id);
    await installContentScripts(ctx.id, ctx, ctx.manifest);
  }

  async unregisterContentScripts(
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> {
    const filter = (args[0] ?? {}) as { ids?: string[] };
    const ids = filter.ids ?? getDynamicRegistrations(ctx.id).map((r) => r.id);
    for (const id of ids) removeDynamicRegistration(ctx.id, id);
    uninstallContentScripts(ctx.id);
    await installContentScripts(ctx.id, ctx, ctx.manifest);
  }

  async getRegisteredContentScripts(
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<unknown> {
    const filter = (args[0] ?? {}) as { ids?: string[] };
    const all = getDynamicRegistrations(ctx.id);
    if (!filter.ids) return all.map((r) => ({ id: r.id, ...r.rule }));
    const set = new Set(filter.ids);
    return all
      .filter((r) => set.has(r.id))
      .map((r) => ({ id: r.id, ...r.rule }));
  }
}
