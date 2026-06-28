import { ChromeEvent } from '../../shared/ChromeEvent';
import { parseCtxFromMeta, serializeCtxForMeta } from '../ctx-encode';
import {
  buildEntryHtml,
  injectBootstrapIntoBackgroundPage,
} from '../entryHtml';
import type { ExtensionContext } from '../../extfs/types';

const failures: string[] = [];

async function expect(
  label: string,
  fn: () => Promise<void> | void,
): Promise<void> {
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
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected substring "${needle}" not found`);
  }
}

const ID = 'a'.repeat(32);

function mkCtx(
  manifestOverrides: Record<string, unknown> = {},
): ExtensionContext {
  return {
    id: ID,
    manifestVersion: 3,
    manifest: {
      manifest_version: 3,
      name: 'Test Ext',
      version: '1.0',
      ...manifestOverrides,
    } as any,
    origin: `${ID}.ddx`,
  };
}

async function main(): Promise<void> {
  console.log('ctx-encode.ts');

  await expect('serializeCtxForMeta / parseCtxFromMeta round-trip (ASCII)', () => {
    const ctx = mkCtx();
    const round = parseCtxFromMeta(serializeCtxForMeta(ctx));
    assertEq(round.id, ctx.id, 'id');
    assertEq(round.manifest.name, ctx.manifest.name, 'name');
    assertEq(round.manifestVersion, 3, 'manifestVersion');
  });

  await expect('round-trip preserves non-ASCII (emoji + CJK)', () => {
    const ctx = mkCtx({ name: '🚀 拡張機能 Тест' });
    const round = parseCtxFromMeta(serializeCtxForMeta(ctx));
    assertEq(round.manifest.name, '🚀 拡張機能 Тест', 'name unicode');
  });

  await expect('output is base64 (alphanumeric + /+=)', () => {
    const ctx = mkCtx();
    const out = serializeCtxForMeta(ctx);
    if (!/^[A-Za-z0-9+/=]+$/.test(out)) {
      throw new Error(`not base64: ${out.slice(0, 40)}...`);
    }
  });

  console.log('entryHtml.ts');

  await expect('buildEntryHtml for MV2 background.scripts', () => {
    const ctx: ExtensionContext = {
      ...mkCtx({
        manifest_version: 2,
        background: { scripts: ['bg.js', 'lib.js'] },
      }),
      manifestVersion: 2,
    };
    const tags = [
      `<script src="bg.js"></script>`,
      `<script src="lib.js"></script>`,
    ];
    const html = buildEntryHtml(ctx, tags);
    assertContains(html, '<!DOCTYPE html>', 'doctype');
    assertContains(html, 'meta name="helium-ctx"', 'meta tag');
    assertContains(html, '__helium_bootstrap__.js', 'bootstrap script');
    assertContains(html, '<script src="bg.js"></script>', 'bg.js tag');
    assertContains(html, '<script src="lib.js"></script>', 'lib.js tag');
    // Bootstrap loads BEFORE extension scripts
    if (
      html.indexOf('__helium_bootstrap__.js') >
      html.indexOf('<script src="bg.js"></script>')
    ) {
      throw new Error('bootstrap script must come before extension scripts');
    }
  });

  await expect('buildEntryHtml for MV3 service_worker', () => {
    const ctx = mkCtx({
      background: { service_worker: 'sw.js' },
    });
    const html = buildEntryHtml(ctx, [`<script src="sw.js"></script>`]);
    assertContains(html, '<script src="sw.js"></script>', 'sw.js tag');
  });

  await expect('buildEntryHtml for MV3 service_worker with type=module', () => {
    const ctx = mkCtx({
      background: { service_worker: 'sw.js', type: 'module' },
    });
    const html = buildEntryHtml(ctx, [
      `<script type="module" src="sw.js"></script>`,
    ]);
    assertContains(
      html,
      '<script type="module" src="sw.js"></script>',
      'module sw tag',
    );
  });

  await expect('buildEntryHtml escapes manifest.name in <title>', () => {
    const ctx = mkCtx({ name: 'Evil <script>alert(1)</script>' });
    const html = buildEntryHtml(ctx, []);
    if (html.includes('<title>Evil <script>')) {
      throw new Error('name not escaped in title');
    }
    assertContains(html, '&lt;script&gt;', 'name escaped');
  });

  await expect('injectBootstrapIntoBackgroundPage inserts after <head>', () => {
    const html = `<html><head><title>Original</title></head><body>x</body></html>`;
    const ctx = mkCtx();
    const out = injectBootstrapIntoBackgroundPage(html, ctx);
    assertContains(out, 'meta name="helium-ctx"', 'meta inserted');
    assertContains(out, '__helium_bootstrap__.js', 'script inserted');
    // <head> appears before the meta tag
    if (out.indexOf('<head>') >= out.indexOf('meta name="helium-ctx"')) {
      throw new Error('meta should be inside <head>, after the opening tag');
    }
    // Original <title> still present
    assertContains(out, '<title>Original</title>', 'original title preserved');
  });

  await expect('injectBootstrapIntoBackgroundPage handles <head> with attributes', () => {
    const html = `<html><head data-foo="bar"><title>X</title></head><body></body></html>`;
    const ctx = mkCtx();
    const out = injectBootstrapIntoBackgroundPage(html, ctx);
    assertContains(out, '<head data-foo="bar">', 'head attrs preserved');
    assertContains(out, 'meta name="helium-ctx"', 'meta inserted');
  });

  await expect('injectBootstrapIntoBackgroundPage handles missing <head>', () => {
    const html = `<html><body>just body</body></html>`;
    const ctx = mkCtx();
    const out = injectBootstrapIntoBackgroundPage(html, ctx);
    assertContains(out, '<head>', 'synthetic head inserted');
    assertContains(out, 'meta name="helium-ctx"', 'meta inserted');
    assertContains(out, '<body>just body</body>', 'body preserved');
  });

  console.log('ChromeEvent.dispatchSync');

  await expect('dispatchSync returns array of listener results', () => {
    const ev = new ChromeEvent();
    ev.addListener(() => 'a');
    ev.addListener(() => 'b');
    ev.addListener(() => true);
    const results = ev.dispatchSync();
    assertEq(results.length, 3, 'length');
    assertEq(results[0], 'a', 'first');
    assertEq(results[1], 'b', 'second');
    assertEq(results[2], true, 'third');
  });

  await expect('dispatchSync converts thrown listeners to undefined', () => {
    const ev = new ChromeEvent();
    ev.addListener(() => 'ok');
    ev.addListener(() => {
      throw new Error('boom');
    });
    ev.addListener(() => 'after');
    const results = ev.dispatchSync();
    assertEq(results.length, 3, 'length');
    assertEq(results[0], 'ok', 'first');
    assertEq(results[1], undefined, 'thrown listener undefined');
    assertEq(results[2], 'after', 'third still runs');
  });

  await expect('dispatchSync passes args to listeners', () => {
    const ev = new ChromeEvent();
    ev.addListener((a: number, b: number) => a + b);
    const results = ev.dispatchSync(2, 3);
    assertEq(results[0], 5, 'sum');
  });

  console.log('cross-list consistency');

  await expect('RPC_BINDINGS rpcMethod column is a subset of HANDLER_PERMISSIONS keys', async () => {
    // Re-implement the lists inline (importing from client.ts pulls in
    // mv2/mv3 Chrome classes which transitively reach DOM globals not
    // available in Node).
    // Keep this list in sync with RPC_BINDINGS in bootstrap/client.ts.
    const RPC_METHODS = [
      'chrome.storage.local.get',
      'chrome.storage.local.set',
      'chrome.storage.local.remove',
      'chrome.storage.local.clear',
      'chrome.storage.local.getBytesInUse',
      'chrome.storage.sync.get',
      'chrome.storage.sync.set',
      'chrome.storage.sync.remove',
      'chrome.storage.sync.clear',
      'chrome.storage.sync.getBytesInUse',
      'chrome.storage.session.get',
      'chrome.storage.session.set',
      'chrome.storage.session.remove',
      'chrome.storage.session.clear',
      'chrome.storage.session.getBytesInUse',
      'chrome.storage.managed.get',
      'chrome.storage.managed.getBytesInUse',
      'chrome.tabs.query',
      'chrome.tabs.create',
      'chrome.runtime.sendMessage',
    ];
    // Keep this set in sync with HANDLER_PERMISSIONS keys in src/apis/extensions.ts.
    const HANDLER_KEYS = new Set([...RPC_METHODS]);
    for (const m of RPC_METHODS) {
      if (!HANDLER_KEYS.has(m)) {
        throw new Error(`RPC binding ${m} has no HANDLER_PERMISSIONS entry`);
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
