import type { UnpackedExtension } from '../shared/unpack';
import type {
  ChromeManifest,
  FirefoxManifest,
} from '../shared/unpack/types';

import { normalizeExtPath } from './path';
import {
  listExtensionTrees,
  readExtensionFileRaw,
  readIndex,
  removeExtensionTree,
  writeExtensionFile,
  writeIndex,
} from './store';
import type {
  ExtensionIndexEntry,
  LoadedExtension,
} from './types';

const DBG_TAG = '[helium/extfs/dbg]';
function dlog(...args: unknown[]): void {
  console.log(DBG_TAG, ...args);
}
function dgroup(label: string): void {
  console.groupCollapsed(`${DBG_TAG} ${label}`);
}
function dgroupEnd(): void {
  console.groupEnd();
}

/**
 * Persist an unpacked extension to TFS and add/update its index
 * entry. Files are written first, then the index. On reinstall
 * (id already present), the old tree is deleted first and the
 * existing `enabled` flag is preserved.
 *
 * Returns the final index entry.
 *
 * Resilience: if `removeExtensionTree` fails partway (e.g., OPFS
 * leaves an empty-but-not-deletable shell after recursive cleanup),
 * we log and CONTINUE. The subsequent writeExtensionFile calls use
 * writeFile-with-create-true semantics, so they will overwrite stale
 * content in place. The previous behavior — propagate EEXIST out as
 * "file already exists" — broke every reinstall the user attempted
 * and left them with no recourse short of clearing OPFS by hand.
 */
export async function installExtension(
  unpacked: UnpackedExtension,
): Promise<ExtensionIndexEntry> {
  dgroup(`installExtension ${unpacked.id} (${unpacked.format}, files=${unpacked.files.size})`);
  dlog('input manifest:', {
    name: unpacked.manifest.name,
    version: unpacked.manifest.version,
    manifest_version: unpacked.manifestVersion,
    idFromKey: unpacked.idFromKey,
  });
  const index = await readIndex();
  dlog(`readIndex returned ${index.extensions.length} entries:`, index.extensions.map(e => e.id));
  const previousEnabled =
    index.extensions.find(e => e.id === unpacked.id)?.enabled ?? true;
  dlog(`previousEnabled=${previousEnabled} (was-in-index=${index.extensions.some(e => e.id === unpacked.id)})`);

  try {
    dlog(`calling removeExtensionTree(${unpacked.id})...`);
    await removeExtensionTree(unpacked.id);
    dlog('removeExtensionTree returned OK');
  } catch (err) {
    console.warn(
      `[helium/extfs] install: removeExtensionTree(${unpacked.id}) failed before write; will overwrite in place. Error:`,
      err,
    );
  }

  let nonManifestCount = 0;
  for (const [relPath, bytes] of unpacked.files) {
    if (relPath === 'manifest.json') continue;
    const safe = normalizeExtPath(relPath);
    if (safe === null) {
      console.warn(
        `[helium/extfs] install: refusing to write suspect path "${relPath}" in ${unpacked.id}`,
      );
      continue;
    }
    try {
      await writeExtensionFile(unpacked.id, safe, bytes);
      nonManifestCount++;
    } catch (err) {
      dlog(`writeExtensionFile failed at "${safe}":`, err);
      dgroupEnd();
      throw new Error(
        `[helium/extfs] install: failed to write "${safe}" for ${unpacked.id}: ${(err as Error).message ?? String(err)}`,
      );
    }
  }
  dlog(`wrote ${nonManifestCount} non-manifest file(s)`);
  const manifestBytes = unpacked.files.get('manifest.json');
  if (!manifestBytes || manifestBytes.byteLength === 0) {
    await removeExtensionTree(unpacked.id);
    throw new Error(
      `[helium/extfs] install: manifest.json missing or empty from unpacked archive for ${unpacked.id}`,
    );
  }
  dlog(`manifest.json bytes about to write: byteLength=${manifestBytes.byteLength}, byteOffset=${manifestBytes.byteOffset}, buffer.byteLength=${manifestBytes.buffer.byteLength}`);
  const manifestPreview = new TextDecoder().decode(manifestBytes.slice(0, Math.min(200, manifestBytes.byteLength)));
  dlog(`manifest.json first 200 chars: ${manifestPreview}`);

  const tightCopy = new Uint8Array(manifestBytes.byteLength);
  tightCopy.set(manifestBytes);
  dlog(`tight copy: byteLength=${tightCopy.byteLength}, byteOffset=${tightCopy.byteOffset}, buffer.byteLength=${tightCopy.buffer.byteLength}`);

  dlog(`writing manifest.json (${tightCopy.byteLength} bytes)...`);
  try {
    await writeExtensionFile(unpacked.id, 'manifest.json', tightCopy);
    dlog('manifest.json write OK');
  } catch (err) {
    dlog('manifest.json write failed:', err);
    dgroupEnd();
    throw new Error(
      `[helium/extfs] install: failed to write manifest.json for ${unpacked.id}: ${(err as Error).message ?? String(err)}`,
    );
  }
  let verifyBytes: Uint8Array | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    verifyBytes = await readExtensionFileRaw(unpacked.id, 'manifest.json');
    dlog(`verify attempt ${attempt}: read-back returned ${verifyBytes === null ? 'null' : `${verifyBytes.byteLength} bytes`}`);
    if (verifyBytes && verifyBytes.byteLength > 0) break;
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  if (!verifyBytes || verifyBytes.byteLength === 0) {
    dlog('verify FAILED after 3 attempts (empty/missing) — purging tree');
    for (const [relPath] of unpacked.files) {
      if (relPath === 'manifest.json') continue;
      const safe = normalizeExtPath(relPath);
      if (safe === null) continue;
      try {
        const probe = await readExtensionFileRaw(unpacked.id, safe);
        dlog(`  POST-FAIL probe ${safe}: ${probe === null ? 'null' : `${probe.byteLength} bytes`}`);
      } catch (probeErr) {
        dlog(`  POST-FAIL probe ${safe}: threw`, probeErr);
      }
      break;
    }
    await removeExtensionTree(unpacked.id);
    dgroupEnd();
    throw new Error(
      `[helium/extfs] install: manifest.json write verification failed for ${unpacked.id} (file empty after write)`,
    );
  }
  dlog(`verify SUCCESS after read-back of ${verifyBytes.byteLength} bytes`);
  const readPreview = new TextDecoder().decode(verifyBytes.slice(0, Math.min(200, verifyBytes.byteLength)));
  dlog(`read-back first 200 chars: ${readPreview}`);
  try {
    JSON.parse(new TextDecoder().decode(verifyBytes));
    dlog('verify manifest.json: parseable JSON OK');
  } catch (err) {
    dlog('verify manifest.json: UNPARSEABLE JSON — purging tree:', err);
    await removeExtensionTree(unpacked.id);
    dgroupEnd();
    throw new Error(
      `[helium/extfs] install: manifest.json write verification failed for ${unpacked.id} (unparseable JSON): ${(err as Error).message}`,
    );
  }

  const entry: ExtensionIndexEntry = {
    id: unpacked.id,
    name: unpacked.manifest.name,
    version: unpacked.manifest.version,
    manifestVersion: unpacked.manifestVersion,
    format: unpacked.format,
    idFromKey: unpacked.idFromKey,
    installedAt: Date.now(),
    enabled: previousEnabled,
  };
  dlog('built entry:', entry);

  const currentIndex = await readIndex();
  dlog(`pre-write readIndex returned ${currentIndex.extensions.length} entries:`, currentIndex.extensions.map(e => e.id));
  const next = currentIndex.extensions.filter(e => e.id !== unpacked.id);
  next.push(entry);
  dlog(`about to writeIndex with ${next.length} entries:`, next.map(e => e.id));
  try {
    await writeIndex({ version: 1, extensions: next });
    dlog('writeIndex returned OK');
  } catch (err) {
    dlog('writeIndex FAILED:', err);
    try {
      await removeExtensionTree(unpacked.id);
    } catch (rmErr) {
      console.warn(
        `[helium/extfs] install: cleanup after writeIndex failure also failed for ${unpacked.id}:`,
        rmErr,
      );
    }
    dgroupEnd();
    throw new Error(
      `[helium/extfs] install: writeIndex failed for ${unpacked.id}: ${(err as Error).message}`,
    );
  }

  const verifyIndex = await readIndex();
  const hasUs = verifyIndex.extensions.some(e => e.id === unpacked.id);
  dlog(`verifyIndex returned ${verifyIndex.extensions.length} entries; hasUs=${hasUs}; ids=${verifyIndex.extensions.map(e => e.id).join(',')}`);
  if (!hasUs) {
    dlog('verifyIndex FAILED — our entry is missing; purging tree');
    try {
      await removeExtensionTree(unpacked.id);
    } catch (rmErr) {
      console.warn(
        `[helium/extfs] install: cleanup after index verify failure also failed for ${unpacked.id}:`,
        rmErr,
      );
    }
    dgroupEnd();
    throw new Error(
      `[helium/extfs] install: index verification failed for ${unpacked.id} (entry missing after writeIndex)`,
    );
  }

  dlog(`installExtension SUCCESS for ${unpacked.id}`);
  dgroupEnd();
  return entry;
}

/**
 * Recursive delete of the extension's TFS tree plus index removal.
 * Idempotent: silently succeeds if `id` is unknown.
 */
export async function uninstallExtension(id: string): Promise<void> {
  await removeExtensionTree(id);
  const index = await readIndex();
  const next = index.extensions.filter(e => e.id !== id);
  if (next.length === index.extensions.length) return;
  await writeIndex({ version: 1, extensions: next });
}

/** Returns every installed extension (enabled or not). */
export async function listExtensions(): Promise<ExtensionIndexEntry[]> {
  const index = await readIndex();
  dlog(`listExtensions: returning ${index.extensions.length} entries:`, index.extensions.map(e => ({ id: e.id, name: e.name, enabled: e.enabled })));
  return index.extensions;
}

/**
 * Returns the index entry + parsed manifest, or null if unknown.
 *
 * Self-healing: if the manifest is missing, zero-byte, or unparseable,
 * the extension is auto-purged from the index + extfs tree before we
 * return null. Without this, a single failed install would warn on
 * every event fanout (chrome.management.onInstalled, .onEnabled,
 * .onDisabled — see host/management/events.ts) for the rest of the
 * session, AND survive across boots until the user wipes OPFS by hand.
 * Now the next call returns null cleanly because the entry is gone.
 */
export async function getExtension(id: string): Promise<{
  entry: ExtensionIndexEntry;
  manifest: ChromeManifest | FirefoxManifest;
} | null> {
  const index = await readIndex();
  const entry = index.extensions.find(e => e.id === id);
  if (!entry) return null;
  const bytes = await readExtensionFileRaw(id, 'manifest.json');
  if (!bytes || bytes.byteLength === 0) {
    console.warn(
      `[helium/extfs] getExtension(${id}): manifest.json missing or empty on disk; purging`,
    );
    await purgeCorruptExtension(id);
    return null;
  }
  let manifest: ChromeManifest | FirefoxManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    console.warn(
      `[helium/extfs] getExtension(${id}): manifest.json corrupt; purging:`,
      err,
    );
    await purgeCorruptExtension(id);
    return null;
  }
  return { entry, manifest };
}

/**
 * Drop a corrupt extension from the index + remove its tree. Best-
 * effort: any failure inside is logged but doesn't propagate so
 * callers can continue gracefully.
 */
async function purgeCorruptExtension(id: string): Promise<void> {
  try {
    const idx = await readIndex();
    const next = idx.extensions.filter(e => e.id !== id);
    if (next.length !== idx.extensions.length) {
      await writeIndex({ version: 1, extensions: next });
    }
  } catch (err) {
    console.warn(
      `[helium/extfs] purgeCorruptExtension: index update failed for ${id}:`,
      err,
    );
  }
  try {
    await removeExtensionTree(id);
  } catch (err) {
    console.warn(
      `[helium/extfs] purgeCorruptExtension: tree removal failed for ${id}:`,
      err,
    );
  }
}

/**
 * Flip the `enabled` flag in the index for one extension. No-op if
 * `id` is unknown. Does NOT spawn or kill execution contexts —
 * that's the next sub-project's responsibility.
 */
export async function setExtensionEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const index = await readIndex();
  const next = index.extensions.map(e =>
    e.id === id ? { ...e, enabled } : e,
  );
  await writeIndex({ version: 1, extensions: next });
}

/**
 * Read a single file from an extension's tree. Path is relative
 * inside the extension (no leading slash). Returns `null` if the
 * path escapes the tree, if the file is missing, or if I/O fails.
 */
export async function readExtensionFile(
  id: string,
  path: string,
): Promise<Uint8Array | null> {
  const safe = normalizeExtPath(path);
  if (safe === null) {
    console.warn(
      `[helium/extfs] readExtensionFile: refusing suspect path "${path}" for ${id}`,
    );
    return null;
  }
  return readExtensionFileRaw(id, safe);
}

/**
 * Boot-time hydration. Reads the index, parses each enabled
 * extension's manifest, returns ready-to-use LoadedExtension
 * records. One corrupt or missing extension does not fail the
 * whole call — it logs a warning and is skipped.
 *
 * Returns data only. The execution-context-spawning spec consumes
 * this list and creates frames + plugins for each entry.
 */
export async function loadExtensionsAtBoot(): Promise<LoadedExtension[]> {
  dgroup('loadExtensionsAtBoot');
  const index = await readIndex();
  dlog(`readIndex: ${index.extensions.length} total entries; ${index.extensions.filter(e => e.enabled).length} enabled`);
  dlog('all entries:', index.extensions.map(e => ({ id: e.id, name: e.name, enabled: e.enabled })));
  const enabled = index.extensions.filter(e => e.enabled);
  const loaded: LoadedExtension[] = [];
  const corruptIds: string[] = [];

  for (const entry of enabled) {
    dlog(`load enabled entry ${entry.id} (${entry.name}): reading manifest.json...`);
    try {
      const bytes = await readExtensionFileRaw(entry.id, 'manifest.json');
      dlog(`  manifest.json read: ${bytes === null ? 'null' : `${bytes.byteLength} bytes`}`);
      if (!bytes || bytes.byteLength === 0) {
        console.warn(
          `[helium/extfs] loadExtensionsAtBoot: missing or empty manifest.json for ${entry.id}; will purge`,
        );
        corruptIds.push(entry.id);
        continue;
      }
      const manifest: ChromeManifest | FirefoxManifest = JSON.parse(
        new TextDecoder().decode(bytes),
      );
      loaded.push({
        entry,
        manifest,
        context: {
          id: entry.id,
          manifestVersion: entry.manifestVersion,
          manifest,
          origin: `${entry.id}.ddx`,
        },
      });
      dlog(`  loaded OK: name=${manifest.name} version=${manifest.version}`);
    } catch (err) {
      dlog(`  manifest load FAILED:`, err);
      console.warn(
        `[helium/extfs] loadExtensionsAtBoot: corrupt extension ${entry.id} (${(err as Error).message}); will purge`,
      );
      corruptIds.push(entry.id);
    }
  }

  if (corruptIds.length > 0) {
    dlog(`PURGE phase: removing ${corruptIds.length} corrupt entries: ${corruptIds.join(',')}`);
    const survivors = index.extensions.filter(e => !corruptIds.includes(e.id));
    await writeIndex({ version: 1, extensions: survivors });
    for (const id of corruptIds) {
      try {
        await removeExtensionTree(id);
      } catch (err) {
        console.warn(
          `[helium/extfs] loadExtensionsAtBoot: failed to remove tree for purged ${id}:`,
          err,
        );
      }
    }
    console.warn(
      `[helium/extfs] loadExtensionsAtBoot: purged ${corruptIds.length} corrupt extension(s): ${corruptIds.join(', ')}`,
    );
  }

  dlog('ORPHAN RECONCILER phase: scanning for trees on disk without index entries');
  try {
    const indexAfterPurge = await readIndex();
    const indexedIds = new Set(indexAfterPurge.extensions.map(e => e.id));
    const onDiskIds = await listExtensionTrees();
    dlog(`indexed ids (${indexedIds.size}):`, [...indexedIds]);
    dlog(`on-disk ids (${onDiskIds.length}):`, onDiskIds);
    const orphanIds = onDiskIds.filter(id => !indexedIds.has(id));
    dlog(`orphans (${orphanIds.length}):`, orphanIds);
    if (orphanIds.length > 0) {
      let recovered = 0;
      let removed = 0;
      const nextEntries = [...indexAfterPurge.extensions];
      for (const id of orphanIds) {
        dlog(`reconciling orphan ${id}: reading manifest.json...`);
        try {
          const bytes = await readExtensionFileRaw(id, 'manifest.json');
          dlog(`  manifest.json read: ${bytes === null ? 'null' : `${bytes.byteLength} bytes`}`);
          if (!bytes || bytes.byteLength === 0) {
            dlog(`  orphan has no manifest — removing tree`);
            await removeExtensionTree(id);
            removed++;
            continue;
          }
          const manifest = JSON.parse(new TextDecoder().decode(bytes)) as
            ChromeManifest | FirefoxManifest;
          dlog(`  parsed manifest: name=${manifest.name} version=${manifest.version} mv=${manifest.manifest_version}`);
          if (
            typeof manifest.name !== 'string' ||
            typeof manifest.version !== 'string' ||
            (manifest.manifest_version !== 2 && manifest.manifest_version !== 3)
          ) {
            dlog(`  manifest validation FAILED — removing tree`);
            await removeExtensionTree(id);
            removed++;
            continue;
          }
          nextEntries.push({
            id,
            name: manifest.name,
            version: manifest.version,
            manifestVersion: manifest.manifest_version,
            format: 'zip',
            idFromKey: false,
            installedAt: Date.now(),
            enabled: true,
          });
          recovered++;
          dlog(`  RECOVERED orphan ${id} → re-indexed as enabled`);
          loaded.push({
            entry: nextEntries[nextEntries.length - 1]!,
            manifest,
            context: {
              id,
              manifestVersion: manifest.manifest_version,
              manifest,
              origin: `${id}.ddx`,
            },
          });
        } catch (err) {
          dlog(`  orphan reconcile threw, removing tree:`, err);
          console.warn(
            `[helium/extfs] loadExtensionsAtBoot: orphan reconcile failed for ${id}, removing:`,
            err,
          );
          try {
            await removeExtensionTree(id);
            removed++;
          } catch (rmErr) {
            console.warn(
              `[helium/extfs] loadExtensionsAtBoot: orphan removal also failed for ${id}:`,
              rmErr,
            );
          }
        }
      }
      if (recovered > 0 || removed > 0) {
        dlog(`writing reconciled index: ${nextEntries.length} entries (recovered=${recovered}, removed=${removed})`);
        await writeIndex({ version: 1, extensions: nextEntries });
        console.warn(
          `[helium/extfs] loadExtensionsAtBoot: reconciled ${orphanIds.length} orphan tree(s): recovered ${recovered}, removed ${removed}`,
        );
      }
    }
  } catch (err) {
    dlog(`orphan reconciler THREW:`, err);
    console.warn(
      '[helium/extfs] loadExtensionsAtBoot: orphan reconciler failed:',
      err,
    );
  }

  dlog(`loadExtensionsAtBoot DONE: returning ${loaded.length} loaded extension(s)`);
  dgroupEnd();
  return loaded;
}
