/**
 * Sanity suite for src/core/helium/content/.
 *
 * Pure-logic checks for matcher.ts + wrapper.ts. Heavier behavior
 * (relay window-tracking with real WeakRefs, Port lifecycle across
 * MessageChannels, ShadowRealm/Neutron isolation) requires a
 * browser-and-Scramjet integration harness and is deferred to the
 * integration milestone.
 *
 * Run via:  npx tsx src/core/helium/content/__sanity__/run.ts
 */

import { compileRule } from '../matcher';
import { buildCssWrapper, buildJsWrapper } from '../wrapper';
import type { ContentScriptRule } from '../../shared/unpack/types';

const failures: string[] = [];

async function expect(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures.push(`${label}: ${(err as Error).message}`);
    console.error(`  FAIL ${label}: ${(err as Error).message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: substring "${needle}" not found`);
  }
}

function rule(overrides: Partial<ContentScriptRule>): ContentScriptRule {
  return { matches: ['<all_urls>'], ...overrides } as ContentScriptRule;
}

async function main(): Promise<void> {
  console.log('matcher.ts');

  await expect('compileRule: basic matches', () => {
    const m = compileRule(rule({ matches: ['https://example.com/*'] }));
    assertEq(m.matches(new URL('https://example.com/x'), false), true, 'match');
    assertEq(m.matches(new URL('https://other.com/x'), false), false, 'no match');
  });

  await expect('compileRule: exclude_matches takes precedence', () => {
    const m = compileRule(rule({ matches: ['https://*/*'], exclude_matches: ['https://example.com/*'] }));
    assertEq(m.matches(new URL('https://example.com/x'), false), false, 'excluded');
    assertEq(m.matches(new URL('https://other.com/x'), false), true, 'included');
  });

  await expect('compileRule: exclude_globs', () => {
    const m = compileRule(rule({ matches: ['<all_urls>'], exclude_globs: ['*/admin*'] }));
    assertEq(m.matches(new URL('https://example.com/admin/x'), false), false, 'glob excludes');
    assertEq(m.matches(new URL('https://example.com/x'), false), true, 'allowed');
  });

  await expect('compileRule: include_globs further restrict', () => {
    const m = compileRule(rule({ matches: ['<all_urls>'], include_globs: ['*/api/*'] }));
    assertEq(m.matches(new URL('https://example.com/api/x'), false), true, 'glob matches');
    assertEq(m.matches(new URL('https://example.com/other'), false), false, 'glob fails');
  });

  await expect('compileRule: about:blank requires opt-in', () => {
    const m1 = compileRule(rule({ matches: ['<all_urls>'] }));
    assertEq(m1.matches(new URL('about:blank'), true), false, 'no opt-in');
    const m2 = compileRule(rule({ matches: ['<all_urls>'], match_about_blank: true }));
    assertEq(m2.matches(new URL('about:blank'), true), true, 'opted in');
  });

  await expect('compileRule: topFrameOnly derives from all_frames', () => {
    assertEq(compileRule(rule({})).topFrameOnly, true, 'default true');
    assertEq(compileRule(rule({ all_frames: true })).topFrameOnly, false, 'all_frames sets false');
  });

  await expect('compileRule: extension origins are never matched', () => {
    const m = compileRule(rule({ matches: ['<all_urls>'] }));
    assertEq(m.matches(new URL('https://abc123.ddx/popup.html'), false), false, 'rejects ext origin');
    assertEq(m.matches(new URL('https://example.com/x'), false), true, 'accepts normal');
  });

  console.log('wrapper.ts');

  const baseCtx = {
    id: 'a'.repeat(32),
    manifestVersion: 3 as const,
    manifest: { manifest_version: 3 as const, name: 'T', version: '1' },
    origin: 'a.ddx',
  };

  await expect('buildJsWrapper MAIN document_start', () => {
    const w = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'console.log("hi");',
      runAt: 'document_start',
      world: 'MAIN',
      topFrameOnly: true,
      scriptKey: 'a:r0:js0:start:MAIN',
    });
    assertContains(w, '__helium_csChrome__', 'factory ref');
    assertContains(w, '__run__()', 'invokes immediately');
    if (w.includes('DOMContentLoaded')) {
      throw new Error('document_start should not register DOMContentLoaded');
    }
  });

  await expect('buildJsWrapper MAIN document_end', () => {
    const w = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'x',
      runAt: 'document_end',
      world: 'MAIN',
      topFrameOnly: false,
      scriptKey: 'a:r0:js0:end:MAIN',
    });
    assertContains(w, 'DOMContentLoaded', 'registers DOMContentLoaded');
    assertContains(w, 'document.readyState', 'checks readyState');
  });

  await expect('buildJsWrapper MAIN document_idle', () => {
    const w = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'x',
      runAt: 'document_idle',
      world: 'MAIN',
      topFrameOnly: false,
      scriptKey: 'a:r0:js0:idle:MAIN',
    });
    assertContains(w, "addEventListener('load'", 'registers load');
  });

  await expect('buildJsWrapper ISOLATED routes through isolation runtime', () => {
    const w = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'console.log(1)',
      runAt: 'document_start',
      world: 'ISOLATED',
      topFrameOnly: false,
      scriptKey: 'a:r0:js0:start:ISO',
    });
    assertContains(w, '__helium_isolation__', 'isolation ref');
    assertContains(w, 'runIsolated', 'runIsolated call');
  });

  await expect('buildJsWrapper handles top-frame-only flag', () => {
    const w1 = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'x',
      runAt: 'document_start',
      world: 'MAIN',
      topFrameOnly: true,
      scriptKey: 'k',
    });
    assertContains(w1, 'window !== window.top', 'top-frame check');
    const w2 = buildJsWrapper({
      extId: baseCtx.id,
      ctx: baseCtx,
      scriptBody: 'x',
      runAt: 'document_start',
      world: 'MAIN',
      topFrameOnly: false,
      scriptKey: 'k',
    });
    assertContains(w2, 'false && window !== window.top', 'inverted check');
  });

  await expect('buildCssWrapper produces valid template', () => {
    const w = buildCssWrapper({
      extId: 'a'.repeat(32),
      cssText: 'body { color: red; }',
      runAt: 'document_start',
      topFrameOnly: false,
    });
    assertContains(w, "createElement('style')", 'creates style el');
    assertContains(w, 'data-helium-content-css', 'data attribute');
    assertContains(w, 'body { color: red; }', 'css body');
  });

  console.log('chrome.scripting permission allowlist');

  await expect('all scripting.* methods are well-formed names', () => {
    const required = [
      'chrome.scripting.executeScript',
      'chrome.scripting.insertCSS',
      'chrome.scripting.removeCSS',
      'chrome.scripting.registerContentScripts',
      'chrome.scripting.unregisterContentScripts',
      'chrome.scripting.getRegisteredContentScripts',
    ];
    for (const m of required) {
      if (!m.startsWith('chrome.scripting.')) {
        throw new Error(`bad method name ${m}`);
      }
    }
  });

  if (failures.length > 0) {
    console.error(`\n${failures.length} sanity check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nall sanity checks passed');
}

main().catch((err) => {
  console.error('sanity runner crashed:', err);
  process.exit(2);
});
