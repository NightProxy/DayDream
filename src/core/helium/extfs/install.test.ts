/**
 * Tests for installExtension's resilience to TFS failures.
 *
 * Reproduces the user-facing bug "whenever I install an extension, it
 * tells me that it already exists and fails to show in UI": when
 * `removeExtensionTree` throws EEXIST (the TFS code for "file already
 * exists", remapped from OPFS' InvalidModificationError on a stuck
 * non-empty rmdir), the install path previously propagated that error
 * directly to the UI. The user saw "✗ Failed to install foo.zip: file
 * already exists" and was stuck.
 *
 * After the fix:
 *  - cleanup failures are logged and swallowed; the install proceeds
 *    by overwriting files in place
 *  - per-file write failures are wrapped with the path so the error
 *    surface points at the actual problem
 *  - the index entry is still produced on success
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnpackedExtension } from '../shared/unpack';
import type { ChromeManifest } from '../shared/unpack/types';

// Mock the store BEFORE importing install so the install module picks
// up the mocked exports.
vi.mock('./store', () => {
  type IndexEntry = {
    id: string;
    name: string;
    version: string;
    manifestVersion: 2 | 3;
    format: 'zip' | 'crx2' | 'crx3' | 'crx4';
    idFromKey: boolean;
    installedAt: number;
    enabled: boolean;
  };
  type Index = { version: 1; extensions: IndexEntry[] };

  return {
    // Stubs whose behavior the individual tests override via mockImpl.
    readIndex: vi.fn(async (): Promise<Index> => ({ version: 1, extensions: [] })),
    writeIndex: vi.fn(async (_idx: Index): Promise<void> => {}),
    writeExtensionFile: vi.fn(async (
      _id: string,
      _rel: string,
      _bytes: Uint8Array,
    ): Promise<void> => {}),
    readExtensionFileRaw: vi.fn(async (
      _id: string,
      _rel: string,
    ): Promise<Uint8Array | null> => null),
    removeExtensionTree: vi.fn(async (_id: string): Promise<void> => {}),
    listExtensionTrees: vi.fn(async (): Promise<string[]> => []),
  };
});

// Imports come AFTER the mock so the install module picks up the
// mocked store exports. ESM module hoisting keeps vi.mock at the top
// of the file regardless of where it textually appears, but
// declaring them after the vi.mock line is the convention used by the
// rest of the repo.
import { installExtension } from './install';
import * as store from './store';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makeUnpacked(overrides: Partial<UnpackedExtension> = {}): UnpackedExtension {
  const manifest: ChromeManifest = {
    name: 'Test Extension',
    version: '1.0.0',
    manifest_version: 3,
    description: 'fixture',
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const files = new Map<string, Uint8Array>([
    ['manifest.json', manifestBytes],
    ['background.js', new TextEncoder().encode('// noop')],
  ]);
  return {
    id: ID,
    idFromKey: true,
    format: 'crx3',
    manifestVersion: 3,
    manifest,
    files,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // By default, readExtensionFileRaw returns the bytes that were last
  // written for the same path — enough to satisfy the install path's
  // manifest verification round-trip.
  const lastWrites = new Map<string, Uint8Array>();
  (store.writeExtensionFile as ReturnType<typeof vi.fn>).mockImplementation(
    async (id: string, rel: string, bytes: Uint8Array) => {
      lastWrites.set(`${id}::${rel}`, bytes);
    },
  );
  (store.readExtensionFileRaw as ReturnType<typeof vi.fn>).mockImplementation(
    async (id: string, rel: string) => lastWrites.get(`${id}::${rel}`) ?? null,
  );

  // Default readIndex / writeIndex round-trip: readIndex returns
  // whatever was last passed to writeIndex (with an initial empty
  // index). Tests can override these with mockResolvedValueOnce /
  // mockImplementationOnce when they need to drive a specific
  // scenario like "preserve previousEnabled across reinstall".
  let lastIndex: { version: 1; extensions: Array<Record<string, unknown>> } = {
    version: 1,
    extensions: [],
  };
  (store.readIndex as ReturnType<typeof vi.fn>).mockImplementation(async () => lastIndex);
  (store.writeIndex as ReturnType<typeof vi.fn>).mockImplementation(async (idx) => {
    lastIndex = idx;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installExtension — resilience', () => {
  it('produces an index entry on a clean install', async () => {
    const entry = await installExtension(makeUnpacked());
    expect(entry.id).toBe(ID);
    expect(entry.name).toBe('Test Extension');
    expect(entry.enabled).toBe(true);
    // writeIndex was called with our entry
    expect(store.writeIndex).toHaveBeenCalledTimes(1);
    const written = (store.writeIndex as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(written.extensions).toHaveLength(1);
    expect(written.extensions[0].id).toBe(ID);
  });

  it('still succeeds when removeExtensionTree throws EEXIST', async () => {
    // Simulate the OPFS bug where a "stuck" rmdir surfaces as
    // "file already exists" — the exact symptom the user reported.
    (store.removeExtensionTree as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('file already exists'), { code: 'EEXIST', name: 'EEXIST' }),
    );

    const entry = await installExtension(makeUnpacked());
    expect(entry.id).toBe(ID);
    expect(entry.name).toBe('Test Extension');
    // Verify writeExtensionFile and writeIndex were called despite the
    // cleanup failure.
    expect(store.writeExtensionFile).toHaveBeenCalled();
    expect(store.writeIndex).toHaveBeenCalledTimes(1);
  });

  it('wraps per-file write errors with the offending path', async () => {
    // First call to writeExtensionFile (background.js) fails — manifest
    // write would be later in the loop, but the install should abort
    // with a path-tagged error before getting there.
    (store.writeExtensionFile as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_id: string, _rel: string, _bytes: Uint8Array) => {
        const err = new Error('disk full');
        throw Object.assign(err, { code: 'ENOSPC', name: 'ENOSPC' });
      },
    );

    await expect(installExtension(makeUnpacked())).rejects.toThrow(
      /failed to write "background\.js"/,
    );
  });

  it('wraps manifest write failure with manifest.json in the message', async () => {
    // Let non-manifest writes succeed, but the manifest write fails.
    let callCount = 0;
    (store.writeExtensionFile as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id: string, rel: string) => {
        callCount += 1;
        if (rel === 'manifest.json') {
          throw Object.assign(new Error('file already exists'), {
            code: 'EEXIST',
            name: 'EEXIST',
          });
        }
      },
    );

    await expect(installExtension(makeUnpacked())).rejects.toThrow(
      /failed to write manifest\.json/,
    );
    // Sanity: the non-manifest file write was attempted before the
    // manifest write.
    expect(callCount).toBeGreaterThan(1);
  });

  it('preserves the previousEnabled flag across reinstall', async () => {
    // Override the default in-memory index with one that already has
    // our extension marked as disabled. The default mockImplementation
    // in beforeEach mirrors what writeIndex wrote, so we just need to
    // seed it before installExtension runs by writing a stub entry.
    (store.writeIndex as ReturnType<typeof vi.fn>).mock.calls.length = 0;
    let lastIndex: { version: 1; extensions: Array<Record<string, unknown>> } = {
      version: 1,
      extensions: [
        {
          id: ID,
          name: 'Old Name',
          version: '0.9.0',
          manifestVersion: 3,
          format: 'crx3',
          idFromKey: true,
          installedAt: 0,
          enabled: false, // user previously disabled it
        },
      ],
    };
    (store.readIndex as ReturnType<typeof vi.fn>).mockImplementation(async () => lastIndex);
    (store.writeIndex as ReturnType<typeof vi.fn>).mockImplementation(async (idx) => {
      lastIndex = idx;
    });

    const entry = await installExtension(makeUnpacked());
    expect(entry.enabled).toBe(false);
  });

  it('rejects when manifest.json is missing from the archive', async () => {
    const u = makeUnpacked();
    u.files.delete('manifest.json');
    await expect(installExtension(u)).rejects.toThrow(/manifest\.json missing or empty/);
  });
});
