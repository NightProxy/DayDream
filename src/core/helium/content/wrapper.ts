/**
 * Wrapper-source builders for content scripts.
 *
 * Pure-string builders that produce the JS source for each
 * (rule × file × timing × world) combination. Three timing
 * templates (document_start/end/idle) × two world modes (MAIN/ISOLATED)
 * × {JS, CSS}.
 *
 * The injector registers the OUTPUT of these builders with
 * `scriptInjectionRegistry`; Scramjet then injects the resulting IIFE
 * at the head of every page matched by the rule.
 */

import type { ExtensionContext } from '../extfs/types';

/**
 * Escape a string for safe inclusion in a JS string literal (single quotes).
 * Handles backslash, single quote, and newlines. Used for paths and IDs.
 */
function jsStringEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

/**
 * Inline the deferral logic for a given run_at value. Returns a JS
 * statement string: either runs `__run__()` immediately or registers
 * an event listener that calls it later.
 */
function deferralBlock(runAt: string): string {
  if (runAt === 'document_start') {
    return '__run__();';
  }
  if (runAt === 'document_end') {
    return `
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    __run__();
  } else {
    document.addEventListener('DOMContentLoaded', __run__, { once: true });
  }`;
  }
  return `
  if (document.readyState === 'complete') {
    __run__();
  } else {
    window.addEventListener('load', __run__, { once: true });
  }`;
}

export interface JsWrapperOpts {
  extId: string;
  ctx: ExtensionContext;
  scriptBody: string;
  runAt: 'document_start' | 'document_end' | 'document_idle';
  world: 'MAIN' | 'ISOLATED';
  topFrameOnly: boolean;
  scriptKey: string;
}

export function buildJsWrapper(opts: JsWrapperOpts): string {
  const ctxJson = JSON.stringify(opts.ctx);
  const scriptKeyLit = `'${jsStringEscape(opts.scriptKey)}'`;
  const topFrameLit = opts.topFrameOnly ? 'true' : 'false';

  if (opts.world === 'ISOLATED') {
    const bodyLit = JSON.stringify(opts.scriptBody);
    return `(function() {
  if (${topFrameLit} && window !== window.top) return;
  var __ctx__ = ${ctxJson};

  function __run__() {
    var iso = window.__helium_isolation__;
    if (!iso || typeof iso.runIsolated !== 'function') {
      console.error('[helium/content] isolation runtime missing for ' + __ctx__.id);
      return;
    }
    iso.runIsolated(__ctx__, ${scriptKeyLit}, ${bodyLit});
  }

  ${deferralBlock(opts.runAt)}
})();`;
  }

  return `(function() {
  if (${topFrameLit} && window !== window.top) return;
  var __ctx__ = ${ctxJson};

  function __run__() {
    var __chrome__ = window.__helium_csChrome__
      ? window.__helium_csChrome__(__ctx__, ${scriptKeyLit})
      : null;
    if (!__chrome__) {
      console.error('[helium/content] mini-chrome runtime missing for ' + __ctx__.id);
      return;
    }
    (function(chrome) {
${opts.scriptBody}
    })(__chrome__);
  }

  ${deferralBlock(opts.runAt)}
})();`;
}

export interface CssWrapperOpts {
  extId: string;
  cssText: string;
  runAt: 'document_start' | 'document_end' | 'document_idle';
  topFrameOnly: boolean;
}

export function buildCssWrapper(opts: CssWrapperOpts): string {
  const cssLit = JSON.stringify(opts.cssText);
  const extIdLit = `'${jsStringEscape(opts.extId)}'`;
  const topFrameLit = opts.topFrameOnly ? 'true' : 'false';

  return `(function() {
  if (${topFrameLit} && window !== window.top) return;

  function __run__() {
    var s = document.createElement('style');
    s.setAttribute('data-helium-content-css', ${extIdLit});
    s.textContent = ${cssLit};
    (document.head || document.documentElement).appendChild(s);
  }

  ${deferralBlock(opts.runAt)}
})();`;
}
