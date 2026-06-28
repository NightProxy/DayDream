/**
 * Per-extension content-script registration into the existing
 * scriptInjectionRegistry. Translates manifest content_scripts +
 * dynamic registrations (chrome.scripting.registerContentScripts)
 * into one ScriptInjectionEntry per (rule × file).
 *
 * The mini-chrome runtime IIFE is registered once globally on first
 * use (any extension's first install) so every Helium-instrumented
 * page has access to `window.__helium_csChrome__` and
 * `window.__helium_isolation__` regardless of which extension is
 * doing the injection.
 *
 * Re-registration is idempotent: callers can re-invoke
 * `installContentScripts` after mutating `dynamicRegistrations`,
 * having uninstalled first.
 */

import { scriptInjectionRegistry } from '@apis/scriptInjection';

import { readExtensionFile } from '../extfs/install';
import type { ExtensionContext } from '../extfs/types';
import type {
  ChromeManifest,
  ContentScriptRule,
  FirefoxManifest,
} from '../shared/unpack/types';

import { compileRule } from './matcher';
import { miniChromeSrc } from './mini-chrome-loader';
import { buildCssWrapper, buildJsWrapper } from './wrapper';

const MINI_CHROME_ID = 'helium-content-mini-chrome-runtime';

let miniChromeRegistered = false;

function registerMiniChromeRuntime(): void {
  if (miniChromeRegistered) return;
  scriptInjectionRegistry.register({
    id: MINI_CHROME_ID,
    match: (_url) => true,
    scripts: [{ kind: 'inline', code: miniChromeSrc }],
  });
  miniChromeRegistered = true;
}

/** Dynamic content-script registrations per extension (chrome.scripting.registerContentScripts). */
const dynamicRegistrations = new Map<
  string,
  Array<{ id: string; rule: ContentScriptRule }>
>();

export function getDynamicRegistrations(
  extId: string,
): Array<{ id: string; rule: ContentScriptRule }> {
  return dynamicRegistrations.get(extId) ?? [];
}

export function addDynamicRegistration(
  extId: string,
  id: string,
  rule: ContentScriptRule,
): void {
  let list = dynamicRegistrations.get(extId);
  if (!list) {
    list = [];
    dynamicRegistrations.set(extId, list);
  }
  // Replace if id matches
  const existing = list.findIndex((r) => r.id === id);
  if (existing >= 0) list[existing] = { id, rule };
  else list.push({ id, rule });
}

export function removeDynamicRegistration(extId: string, id: string): boolean {
  const list = dynamicRegistrations.get(extId);
  if (!list) return false;
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  if (list.length === 0) dynamicRegistrations.delete(extId);
  return true;
}

async function registerOneRule(
  extId: string,
  ctx: ExtensionContext,
  ruleKey: string,
  rule: ContentScriptRule,
): Promise<void> {
  const compiled = compileRule(rule);
  const runAt: 'document_start' | 'document_end' | 'document_idle' =
    rule.run_at ?? 'document_idle';
  const world: 'MAIN' | 'ISOLATED' = rule.world ?? 'ISOLATED';
  const cssFiles = rule.css ?? [];
  const jsFiles = rule.js ?? [];

  for (let i = 0; i < cssFiles.length; i++) {
    const bytes = await readExtensionFile(extId, cssFiles[i]!);
    if (!bytes) continue;
    scriptInjectionRegistry.register({
      id: `helium-content-${extId}-${ruleKey}-css-${i}`,
      match: (url: URL) => compiled.matches(url, url.href === 'about:blank'),
      scripts: [
        {
          kind: 'inline',
          code: buildCssWrapper({
            extId,
            cssText: new TextDecoder().decode(bytes),
            runAt,
            topFrameOnly: compiled.topFrameOnly,
          }),
        },
      ],
    });
  }

  for (let i = 0; i < jsFiles.length; i++) {
    const bytes = await readExtensionFile(extId, jsFiles[i]!);
    if (!bytes) continue;
    const scriptKey = `${extId}:${ruleKey}:js${i}:${runAt}:${world}`;
    scriptInjectionRegistry.register({
      id: `helium-content-${extId}-${ruleKey}-js-${i}`,
      match: (url: URL) => compiled.matches(url, url.href === 'about:blank'),
      scripts: [
        {
          kind: 'inline',
          code: buildJsWrapper({
            extId,
            ctx,
            scriptBody: new TextDecoder().decode(bytes),
            runAt,
            world,
            topFrameOnly: compiled.topFrameOnly,
            scriptKey,
          }),
        },
      ],
    });
  }
}

export async function installContentScripts(
  extId: string,
  ctx: ExtensionContext,
  manifest: ChromeManifest | FirefoxManifest,
): Promise<void> {
  const rules = manifest.content_scripts;
  const hasStatic = Array.isArray(rules) && rules.length > 0;
  const dyn = dynamicRegistrations.get(extId) ?? [];

  if (hasStatic || dyn.length > 0) {
    registerMiniChromeRuntime();
  }

  if (hasStatic && rules) {
    for (let i = 0; i < rules.length; i++) {
      await registerOneRule(extId, ctx, `static-r${i}`, rules[i]!);
    }
  }
  for (const d of dyn) {
    await registerOneRule(extId, ctx, `dyn-${d.id}`, d.rule);
  }
}

export function uninstallContentScripts(extId: string): void {
  const prefix = `helium-content-${extId}-`;
  for (const entry of scriptInjectionRegistry.list()) {
    if (entry.id.startsWith(prefix)) {
      scriptInjectionRegistry.unregister(entry.id);
    }
  }
}
