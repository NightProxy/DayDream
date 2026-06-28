import { contentTypeFromPath } from '../mime';
import { extPath, normalizeExtPath } from '../path';
import { compileHostPatterns, isAllowedExternalOrigin } from '../policy';
import type { ExtensionContext, ExtensionIndex } from '../types';
import { isAccessible, matchGlob, matchUrlPattern } from '../war';

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
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function mkCtx(id: string, overrides: Partial<ExtensionContext['manifest']> = {}): ExtensionContext {
  return {
    id,
    manifestVersion: 3,
    manifest: {
      manifest_version: 3,
      name: 'Test',
      version: '1.0',
      ...overrides,
    } as any,
    origin: `${id}.ddx`,
  };
}

const ID = 'a'.repeat(32);
const OTHER_ID = 'b'.repeat(32);

async function main(): Promise<void> {
  console.log('path.ts');

  await expect('extPath joins id and rel cleanly', () => {
    assertEq(extPath(ID, 'manifest.json'), `/extensions/${ID}/manifest.json`, 'extPath');
    assertEq(extPath(ID, '/manifest.json'), `/extensions/${ID}/manifest.json`, 'extPath with leading slash');
    assertEq(extPath(ID, 'sub/dir/file.js'), `/extensions/${ID}/sub/dir/file.js`, 'extPath nested');
  });

  await expect('normalizeExtPath accepts simple paths', () => {
    assertEq(normalizeExtPath('foo.html'), 'foo.html', 'simple');
    assertEq(normalizeExtPath('/foo.html'), 'foo.html', 'strips leading slash');
    assertEq(normalizeExtPath('sub/dir/file.js'), 'sub/dir/file.js', 'nested');
  });

  await expect('normalizeExtPath rejects forbidden segments', () => {
    assertEq(normalizeExtPath(''), null, 'empty');
    assertEq(normalizeExtPath('/'), null, 'just slash');
    assertEq(normalizeExtPath('..'), null, 'dot dot alone');
    assertEq(normalizeExtPath('foo/..'), null, 'dot dot in middle');
    assertEq(normalizeExtPath('foo/./bar'), null, 'dot in middle');
    assertEq(normalizeExtPath('foo//bar'), null, 'double slash');
    assertEq(normalizeExtPath('foo/\x00bar'), null, 'null byte');
  });

  console.log('mime.ts');

  await expect('contentTypeFromPath maps common extensions', () => {
    assertEq(contentTypeFromPath('index.html'), 'text/html; charset=utf-8', 'html');
    assertEq(contentTypeFromPath('main.js'), 'text/javascript; charset=utf-8', 'js');
    assertEq(contentTypeFromPath('m.mjs'), 'text/javascript; charset=utf-8', 'mjs');
    assertEq(contentTypeFromPath('style.css'), 'text/css; charset=utf-8', 'css');
    assertEq(contentTypeFromPath('data.json'), 'application/json; charset=utf-8', 'json');
    assertEq(contentTypeFromPath('icon.svg'), 'image/svg+xml', 'svg');
    assertEq(contentTypeFromPath('icon.png'), 'image/png', 'png');
    assertEq(contentTypeFromPath('font.woff2'), 'font/woff2', 'woff2');
    assertEq(contentTypeFromPath('mod.wasm'), 'application/wasm', 'wasm');
  });

  await expect('contentTypeFromPath case-insensitive on extension', () => {
    assertEq(contentTypeFromPath('INDEX.HTML'), 'text/html; charset=utf-8', 'uppercase html');
    assertEq(contentTypeFromPath('Icon.PNG'), 'image/png', 'mixed case png');
  });

  await expect('contentTypeFromPath unknown extensions get octet-stream', () => {
    assertEq(contentTypeFromPath('weird.xyzzy'), 'application/octet-stream', 'xyzzy');
    assertEq(contentTypeFromPath('noextension'), 'application/octet-stream', 'no dot');
  });

  console.log('war.ts');

  await expect('matchGlob basic patterns', () => {
    assertEq(matchGlob('*.html', 'index.html'), true, 'star html');
    assertEq(matchGlob('*.html', 'index.js'), false, 'star html negative');
    assertEq(matchGlob('exact.js', 'exact.js'), true, 'exact');
    assertEq(matchGlob('exact.js', 'exactxjs'), false, 'exact negative');
    assertEq(matchGlob('*', 'anything'), true, 'just star');
    assertEq(matchGlob('foo/*/bar.js', 'foo/x/bar.js'), true, 'multi star');
    assertEq(matchGlob('foo/*/bar.js', 'foo/x/y/bar.js'), true, 'star greedy');
  });

  await expect('matchGlob escapes regex specials', () => {
    assertEq(matchGlob('a.b', 'a.b'), true, 'dot literal');
    assertEq(matchGlob('a.b', 'axb'), false, 'dot not regex');
    assertEq(matchGlob('a+b', 'a+b'), true, 'plus literal');
  });

  await expect('matchUrlPattern <all_urls>', () => {
    assertEq(matchUrlPattern('<all_urls>', 'https://example.com/path'), true, 'https');
    assertEq(matchUrlPattern('<all_urls>', 'ftp://example.com/path'), true, 'ftp');
  });

  await expect('matchUrlPattern wildcards', () => {
    assertEq(matchUrlPattern('*://*/*', 'https://example.com/x'), true, 'star scheme');
    assertEq(matchUrlPattern('https://*/*', 'https://example.com/x'), true, 'host wild');
    assertEq(matchUrlPattern('https://*/*', 'http://example.com/x'), false, 'scheme mismatch');
    assertEq(matchUrlPattern('https://example.com/*', 'https://example.com/foo/bar'), true, 'host exact');
    assertEq(matchUrlPattern('https://example.com/*', 'https://other.com/x'), false, 'host mismatch');
  });

  await expect('matchUrlPattern subdomain wildcard', () => {
    assertEq(matchUrlPattern('https://*.example.com/*', 'https://api.example.com/x'), true, 'subdomain');
    assertEq(matchUrlPattern('https://*.example.com/*', 'https://example.com/x'), true, 'bare apex');
    assertEq(matchUrlPattern('https://*.example.com/*', 'https://other.com/x'), false, 'different');
  });

  await expect('isAccessible same-origin always allowed', () => {
    const ctx = mkCtx(ID);
    const context = { parsed: { client: { origin: `https://${ctx.origin}` } } };
    assertEq(isAccessible('any/file.js', context, ctx), true, 'same origin');
    const noInitiator = { parsed: {} };
    assertEq(isAccessible('any/file.js', noInitiator, ctx), true, 'no initiator');
  });

  await expect('isAccessible MV2 string-array WAR', () => {
    const ctx = mkCtx(ID, { web_accessible_resources: ['public/*.html', 'icons/*.png'] } as any);
    const context = { parsed: { client: { origin: 'https://attacker.com' } } };
    assertEq(isAccessible('public/foo.html', context, ctx), true, 'allowed glob');
    assertEq(isAccessible('icons/x.png', context, ctx), true, 'allowed second glob');
    assertEq(isAccessible('private.js', context, ctx), false, 'not in WAR');
  });

  await expect('isAccessible MV3 object-form WAR with matches', () => {
    const ctx = mkCtx(ID, {
      web_accessible_resources: [
        { resources: ['public/*'], matches: ['https://allowed.com/*'] },
      ],
    } as any);
    const allowed = { parsed: { client: { origin: 'https://allowed.com' } } };
    const denied = { parsed: { client: { origin: 'https://denied.com' } } };
    assertEq(isAccessible('public/x.html', allowed, ctx), true, 'matches allowed');
    assertEq(isAccessible('public/x.html', denied, ctx), false, 'matches denied');
  });

  await expect('isAccessible MV3 object-form WAR with extension_ids', () => {
    const ctx = mkCtx(ID, {
      web_accessible_resources: [
        { resources: ['msg.js'], extension_ids: [OTHER_ID] },
      ],
    } as any);
    const peer = { parsed: { client: { origin: `https://${OTHER_ID}.ddx` } } };
    const stranger = { parsed: { client: { origin: `https://${'c'.repeat(32)}.ddx` } } };
    assertEq(isAccessible('msg.js', peer, ctx), true, 'peer id');
    assertEq(isAccessible('msg.js', stranger, ctx), false, 'stranger id');
  });

  await expect('isAccessible MV3 extension_ids wildcard', () => {
    const ctx = mkCtx(ID, {
      web_accessible_resources: [
        { resources: ['any.js'], extension_ids: ['*'] },
      ],
    } as any);
    const peer = { parsed: { client: { origin: `https://${OTHER_ID}.ddx` } } };
    assertEq(isAccessible('any.js', peer, ctx), true, 'wildcard');
  });

  console.log('policy.ts');

  await expect('compileHostPatterns extracts MV3 host_permissions', () => {
    const m: any = {
      manifest_version: 3,
      name: 'X',
      version: '1',
      host_permissions: ['https://*/*', 'https://api.example.com/*'],
    };
    const out = compileHostPatterns(m);
    assertEq(out.length, 2, 'count');
    assertEq(out[0], 'https://*/*', 'first');
  });

  await expect('compileHostPatterns filters MV2 permissions to URL patterns', () => {
    const m: any = {
      manifest_version: 2,
      name: 'X',
      version: '1',
      permissions: ['tabs', 'https://*/*', 'storage', '<all_urls>'],
    };
    const out = compileHostPatterns(m);
    assertEq(out.length, 2, 'count');
    assertEq(out.includes('https://*/*'), true, 'has url pattern');
    assertEq(out.includes('<all_urls>'), true, 'has all_urls');
  });

  await expect('isAllowedExternalOrigin empty manifest denies', () => {
    const ctx = mkCtx(ID);
    const patterns = compileHostPatterns(ctx.manifest);
    assertEq(
      isAllowedExternalOrigin(new URL('https://example.com/'), ctx, patterns),
      false,
      'deny by default',
    );
  });

  await expect('isAllowedExternalOrigin host_permissions allows', () => {
    const ctx = mkCtx(ID, { host_permissions: ['https://api.example.com/*'] } as any);
    const patterns = compileHostPatterns(ctx.manifest);
    assertEq(
      isAllowedExternalOrigin(new URL('https://api.example.com/v1/x'), ctx, patterns),
      true,
      'allowed',
    );
    assertEq(
      isAllowedExternalOrigin(new URL('https://other.com/x'), ctx, patterns),
      false,
      'not allowed',
    );
  });

  await expect('isAllowedExternalOrigin externally_connectable.ids', () => {
    const ctx = mkCtx(ID, { externally_connectable: { ids: [OTHER_ID] } } as any);
    const patterns = compileHostPatterns(ctx.manifest);
    assertEq(
      isAllowedExternalOrigin(new URL(`https://${OTHER_ID}.ddx/`), ctx, patterns),
      true,
      'peer allowed',
    );
  });

  await expect('isAllowedExternalOrigin allows any *.ddx (downstream WAR decides)', () => {
    const ctx = mkCtx(ID);
    const patterns = compileHostPatterns(ctx.manifest);
    assertEq(
      isAllowedExternalOrigin(new URL(`https://${OTHER_ID}.ddx/file.js`), ctx, patterns),
      true,
      'ddx host allowed',
    );
  });

  console.log('types.ts');

  await expect('ExtensionIndex JSON round-trips', () => {
    const idx: ExtensionIndex = {
      version: 1,
      extensions: [
        {
          id: ID,
          name: 'Test',
          version: '1.0',
          manifestVersion: 3,
          format: 'crx3',
          idFromKey: true,
          installedAt: 1234567890,
          enabled: true,
        },
      ],
    };
    const round = JSON.parse(JSON.stringify(idx)) as ExtensionIndex;
    assertEq(round.version, 1, 'version');
    assertEq(round.extensions[0].id, ID, 'entry id');
    assertEq(round.extensions[0].format, 'crx3', 'format');
  });

  if (failures.length > 0) {
    console.error(`\n${failures.length} sanity check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nall sanity checks passed');
}

main().catch(err => {
  console.error('sanity runner crashed:', err);
  process.exit(2);
});
