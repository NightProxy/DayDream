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
  const lastWrites = new Map<string, Uint8Array>();
  (store.writeExtensionFile as ReturnType<typeof vi.fn>).mockImplementation(
    async (id: string, rel: string, bytes: Uint8Array) => {
      lastWrites.set(`${id}::${rel}`, bytes);
    },
  );
  (store.readExtensionFileRaw as ReturnType<typeof vi.fn>).mockImplementation(
    async (id: string, rel: string) => lastWrites.get(`${id}::${rel}`) ?? null,
  );

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
    expect(store.writeIndex).toHaveBeenCalledTimes(1);
    const written = (store.writeIndex as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(written.extensions).toHaveLength(1);
    expect(written.extensions[0].id).toBe(ID);
  });

  it('still succeeds when removeExtensionTree throws EEXIST', async () => {
    (store.removeExtensionTree as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('file already exists'), { code: 'EEXIST', name: 'EEXIST' }),
    );

    const entry = await installExtension(makeUnpacked());
    expect(entry.id).toBe(ID);
    expect(entry.name).toBe('Test Extension');
    expect(store.writeExtensionFile).toHaveBeenCalled();
    expect(store.writeIndex).toHaveBeenCalledTimes(1);
  });

  it('wraps per-file write errors with the offending path', async () => {
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
    expect(callCount).toBeGreaterThan(1);
  });

  it('preserves the previousEnabled flag across reinstall', async () => {
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
