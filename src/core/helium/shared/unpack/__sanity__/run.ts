// packages/shared/src/unpack/__sanity__/run.ts
import { deriveExtensionId } from '../id';

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

async function main(): Promise<void> {
  console.log('id.ts');

  await expect('derives 32-char a..p ID from a known key', async () => {
    const key = new TextEncoder().encode('hello');
    const { id, fromKey } = await deriveExtensionId(key);
    if (id !== 'cmpcenlkfplakdaocgoidlckmfljocjo') {
      throw new Error(`expected cmpcenlkfplakdaocgoidlckmfljocjo, got ${id}`);
    }
    if (!fromKey) throw new Error('fromKey should be true for non-null key');
  });

  await expect('falls back to UUID-derived ID when key is null', async () => {
    const { id, fromKey } = await deriveExtensionId(null);
    if (id.length !== 32) throw new Error(`expected length 32, got ${id.length}`);
    if (!/^[a-p]{32}$/.test(id)) {
      throw new Error(`expected a..p only, got ${id}`);
    }
    if (fromKey) throw new Error('fromKey should be false for null key');
  });

  await expect('two UUID fallbacks differ', async () => {
    const a = await deriveExtensionId(null);
    const b = await deriveExtensionId(null);
    if (a.id === b.id) throw new Error('UUID fallback collided');
  });

  console.log('\ncrx.ts');

  const { parseCrx } = await import('../crx');

  await expect('rejects unknown magic', () => {
    const bad = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]);
    let threw = false;
    try {
      parseCrx(bad);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected parseCrx to throw on unknown magic');
  });

  await expect('parses CRX3 envelope and reports zipBody', () => {
    const header = new Uint8Array(12 + 8 + 8);
    const view = new DataView(header.buffer);
    // All CRX versions share magic 0x34327243 ("Cr24"); the version
    // field at offset 4 disambiguates.
    view.setUint32(0, 0x34327243, true);
    view.setUint32(4, 3, true);
    view.setUint32(8, 8, true);
    view.setUint32(20, 0x04034b50, true);
    view.setUint32(24, 0xdeadbeef, true);

    const result = parseCrx(header);
    if (result.format !== 'crx3') {
      throw new Error(`expected crx3, got ${result.format}`);
    }
    if (result.zipBody.length !== 8) {
      throw new Error(`expected zipBody length 8, got ${result.zipBody.length}`);
    }
    const zipMagic = new DataView(
      result.zipBody.buffer,
      result.zipBody.byteOffset,
      4,
    ).getUint32(0, true);
    if (zipMagic !== 0x04034b50) {
      throw new Error(`zipBody does not start with ZIP magic`);
    }
  });

  await expect('parses CRX2 and extracts public key', () => {
    const pubKey = new Uint8Array(16).fill(0x42);
    const sig = new Uint8Array(8).fill(0x99);
    const zipBody = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

    const total = new Uint8Array(16 + pubKey.length + sig.length + zipBody.length);
    const view = new DataView(total.buffer);
    view.setUint32(0, 0x34327243, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, pubKey.length, true);
    view.setUint32(12, sig.length, true);
    total.set(pubKey, 16);
    total.set(sig, 16 + pubKey.length);
    total.set(zipBody, 16 + pubKey.length + sig.length);

    const result = parseCrx(total);
    if (result.format !== 'crx2') throw new Error(`expected crx2, got ${result.format}`);
    if (!result.publicKey || result.publicKey.length !== 16) {
      throw new Error('publicKey not extracted from CRX2');
    }
    if (result.publicKey[0] !== 0x42) throw new Error('publicKey bytes wrong');
    if (result.zipBody.length !== 8) throw new Error('zipBody length wrong');
  });

  console.log('\nzip.ts');

  const { unzip } = await import('../zip');
  const { zipSync, strToU8 } = await import('fflate');

  const defaultOpts = {
    maxFileSize: 50 * 1024 * 1024,
    maxUncompressedSize: 200 * 1024 * 1024,
  };

  await expect('extracts a simple stored ZIP', () => {
    const zipped = zipSync({
      'manifest.json': strToU8('{"manifest_version":3,"name":"a","version":"1"}'),
      'background.js': strToU8('console.log(1)'),
    });
    const files = unzip(zipped, defaultOpts);
    if (files.size !== 2) throw new Error(`expected 2 files, got ${files.size}`);
    const manifest = files.get('manifest.json');
    if (!manifest) throw new Error('manifest.json missing');
    const text = new TextDecoder().decode(manifest);
    if (!text.includes('"manifest_version":3')) {
      throw new Error('manifest content wrong');
    }
  });

  await expect('rejects path traversal', () => {
    const zipped = zipSync({ '../evil': strToU8('x') });
    let threw = false;
    try {
      unzip(zipped, defaultOpts);
    } catch (err) {
      threw = /path traversal/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected path traversal rejection');
  });

  await expect('rejects when total uncompressed exceeds limit', () => {
    const big = new Uint8Array(2048);
    const zipped = zipSync({ 'a.bin': big, 'b.bin': big });
    let threw = false;
    try {
      unzip(zipped, { maxFileSize: 50_000_000, maxUncompressedSize: 3000 });
    } catch (err) {
      threw = /max uncompressed size/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected size-limit rejection');
  });

  await expect('rejects per-file size over limit', () => {
    const zipped = zipSync({ 'big.bin': new Uint8Array(5000) });
    let threw = false;
    try {
      unzip(zipped, { maxFileSize: 1000, maxUncompressedSize: 50_000_000 });
    } catch (err) {
      threw = /max file size/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected per-file rejection');
  });

  await expect('skips directory entries', () => {
    const zipped = zipSync({
      'dir/': new Uint8Array(0),
      'dir/file.txt': strToU8('hello'),
    });
    const files = unzip(zipped, defaultOpts);
    if (files.has('dir/')) throw new Error('directory entry not skipped');
    if (!files.has('dir/file.txt')) throw new Error('file inside dir missing');
  });

  console.log('\nmanifest.ts');

  const { parseManifest } = await import('../manifest');

  const makeFiles = (json: string): Map<string, Uint8Array> => {
    const m = new Map<string, Uint8Array>();
    m.set('manifest.json', new TextEncoder().encode(json));
    return m;
  };

  await expect('parses MV3 manifest', () => {
    const result = parseManifest(
      makeFiles('{"manifest_version":3,"name":"x","version":"1.0"}'),
    );
    if (result.manifestVersion !== 3) throw new Error('expected MV3');
    if (result.isFirefox) throw new Error('expected isFirefox false');
    if (result.manifest.name !== 'x') throw new Error('name wrong');
  });

  await expect('parses MV2 manifest', () => {
    const result = parseManifest(
      makeFiles('{"manifest_version":2,"name":"x","version":"1.0"}'),
    );
    if (result.manifestVersion !== 2) throw new Error('expected MV2');
  });

  await expect('detects Firefox via browser_specific_settings', () => {
    const result = parseManifest(
      makeFiles(
        '{"manifest_version":2,"name":"x","version":"1","browser_specific_settings":{"gecko":{"id":"a@b"}}}',
      ),
    );
    if (!result.isFirefox) throw new Error('expected isFirefox true');
  });

  await expect('detects Firefox via legacy applications key', () => {
    const result = parseManifest(
      makeFiles(
        '{"manifest_version":2,"name":"x","version":"1","applications":{"gecko":{"id":"a@b"}}}',
      ),
    );
    if (!result.isFirefox) throw new Error('expected isFirefox true');
  });

  await expect('rejects missing manifest.json', () => {
    let threw = false;
    try {
      parseManifest(new Map());
    } catch (err) {
      threw = /manifest\.json missing/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected rejection');
  });

  await expect('rejects invalid JSON', () => {
    let threw = false;
    try {
      parseManifest(makeFiles('{not json'));
    } catch (err) {
      threw = /invalid json/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected rejection');
  });

  await expect('rejects manifest_version 4', () => {
    let threw = false;
    try {
      parseManifest(makeFiles('{"manifest_version":4,"name":"x","version":"1"}'));
    } catch (err) {
      threw = /manifest_version/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected rejection');
  });

  await expect('rejects missing name', () => {
    let threw = false;
    try {
      parseManifest(makeFiles('{"manifest_version":3,"version":"1"}'));
    } catch (err) {
      threw = /name/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected rejection');
  });

  await expect('rejects missing version', () => {
    let threw = false;
    try {
      parseManifest(makeFiles('{"manifest_version":3,"name":"x"}'));
    } catch (err) {
      threw = /version/i.test((err as Error).message);
    }
    if (!threw) throw new Error('expected rejection');
  });

  console.log('\nindex.ts (top-level unpackExtension)');

  const { unpackExtension } = await import('../index');

  const makeManifestZip = (json: string): Uint8Array =>
    zipSync({ 'manifest.json': strToU8(json) });

  await expect('raw ZIP path: parses and returns UUID-derived ID', async () => {
    const zipped = makeManifestZip(
      '{"manifest_version":3,"name":"a","version":"1"}',
    );
    const result = await unpackExtension(zipped);
    if (result.format !== 'zip') throw new Error(`format=${result.format}`);
    if (result.manifestVersion !== 3) throw new Error('manifestVersion wrong');
    if (result.idFromKey) throw new Error('idFromKey should be false');
    if (!/^[a-p]{32}$/.test(result.id)) throw new Error('id shape wrong');
  });

  await expect('uses manifest.key fallback when present', async () => {
    const b64 = btoa('hello-key-bytes');
    const zipped = makeManifestZip(
      `{"manifest_version":3,"name":"a","version":"1","key":"${b64}"}`,
    );
    const result = await unpackExtension(zipped);
    if (!result.idFromKey) throw new Error('idFromKey should be true');
    const second = await unpackExtension(zipped);
    if (result.id !== second.id) throw new Error('id should be deterministic');
  });

  await expect('rejects unknown magic at top level', async () => {
    let threw = false;
    try {
      await unpackExtension(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('expected top-level rejection');
  });

  await expect('accepts ArrayBuffer input', async () => {
    const zipped = makeManifestZip(
      '{"manifest_version":2,"name":"a","version":"1"}',
    );
    const ab = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;
    const result = await unpackExtension(ab);
    if (result.manifestVersion !== 2) throw new Error('MV2 not detected');
  });

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nall sanity checks passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
