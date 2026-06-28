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

// ─────────────────────────────────────────────────────────────────────────
// Debug logging
//
// Verbose tracing for the install + boot-load + list flows. Routes
// through console.log/info so the user can see them in the DevTools
// console without a special debug build. Tagged `[helium/extfs/dbg]`
// so they're easy to filter against (or hide entirely with a console
// filter once the bug is sorted).
// ─────────────────────────────────────────────────────────────────────────
const DBG_TAG = '[helium/extfs/dbg]';
function dlog(...args: unknown[]): void {
  console.log(DBG_TAG, ...args);
}
function dgroup(label: string): void {
  // Use a collapsed group so a flood of dlog entries inside a phase
  // is easy to scroll past, but still expandable.
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

  // Reinstall: drop the old tree if any. Safe even on a fresh install
  // because removeExtensionTree is idempotent. Failures are now
  // best-effort — see the JSDoc above. We still log so persistent
  // cleanup trouble shows up in the console rather than silently
  // accumulating leftover files in OPFS.
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

  // Write non-manifest files first, then manifest.json LAST. Two reasons:
  //   1. manifest.json existence is the boot-time signal that the
  //      extension is fully installed (see loadExtensionsAtBoot). If we
  //      crash mid-loop, we want manifest.json to either be absent
  //      (treated as "missing, purge") or fully written (valid install).
  //      Writing it last avoids the "manifest exists but other files
  //      are partial" state.
  //   2. Concurrent reads from event fanouts (chrome.management.*)
  //      hitting getExtension during install will see "no manifest yet"
  //      until everything else is on disk.
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
      // A single bad asset shouldn't take down the whole install —
      // wrap the error with the path so the user gets a real
      // diagnostic instead of just "file already exists".
      dgroupEnd();
      throw new Error(
        `[helium/extfs] install: failed to write "${safe}" for ${unpacked.id}: ${(err as Error).message ?? String(err)}`,
      );
    }
  }
  dlog(`wrote ${nonManifestCount} non-manifest file(s)`);
  // Now manifest.json — and verify the round-trip BEFORE writing the
  // index entry. If the on-disk bytes don't parse, we abort the install
  // entirely and clean up. Better to surface a real error to the user
  // than leave a phantom entry pointing at a broken tree.
  const manifestBytes = unpacked.files.get('manifest.json');
  if (!manifestBytes || manifestBytes.byteLength === 0) {
    await removeExtensionTree(unpacked.id);
    throw new Error(
      `[helium/extfs] install: manifest.json missing or empty from unpacked archive for ${unpacked.id}`,
    );
  }
  // Diagnostic: log what we're about to write so we can compare with
  // the read-back. byteOffset != 0 or byteLength < buffer.byteLength
  // would mean we're passing a sliced view into TFS — which TFS' own
  // writeFile path tries to handle via `content.buffer.slice(byteOffset,
  // byteOffset+byteLength)` but is a known source of zero-byte writes
  // if the slice math goes sideways.
  dlog(`manifest.json bytes about to write: byteLength=${manifestBytes.byteLength}, byteOffset=${manifestBytes.byteOffset}, buffer.byteLength=${manifestBytes.buffer.byteLength}`);
  const manifestPreview = new TextDecoder().decode(manifestBytes.slice(0, Math.min(200, manifestBytes.byteLength)));
  dlog(`manifest.json first 200 chars: ${manifestPreview}`);

  // Copy into a fresh tight Uint8Array. Defends against TFS' write
  // path mishandling sliced views (where byteOffset != 0). If we keep
  // hitting "file empty after write", this is the most likely root
  // cause — a TFS writeFile that reads from the wrong region of the
  // underlying ArrayBuffer.
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
  // Verification round-trip: read back the bytes we just wrote and
  // confirm they parse. This catches:
  //   - silent TFS write truncation (the symptom that produced the
  //     zero-byte manifest.json in the user's session)
  //   - concurrent rmrf races (defended by the install mutex at the
  //     ExtensionManager level, but cheap to verify here too)
  //
  // Retry up to 3 times with a brief yield in between. OPFS' writes
  // are supposed to be flushed by the time TFS' `await writable.close()`
  // resolves, but if we're hitting an eventual-consistency window then
  // a small delay should suffice.
  let verifyBytes: Uint8Array | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    verifyBytes = await readExtensionFileRaw(unpacked.id, 'manifest.json');
    dlog(`verify attempt ${attempt}: read-back returned ${verifyBytes === null ? 'null' : `${verifyBytes.byteLength} bytes`}`);
    if (verifyBytes && verifyBytes.byteLength > 0) break;
    if (attempt < 3) {
      // Yield to the event loop. If this works, the underlying issue
      // is OPFS write-flush timing in TFS that should be reported
      // upstream.
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  if (!verifyBytes || verifyBytes.byteLength === 0) {
    dlog('verify FAILED after 3 attempts (empty/missing) — purging tree');
    // BEFORE purging, do one last diagnostic: try to read EVERY file
    // we wrote, to see whether the issue is specific to manifest.json
    // or is wholesale.
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
      break; // one is enough for diagnostics
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

  // Re-read the index right before writing. If a parallel install of
  // a DIFFERENT extension landed in between (mutex only guards the
  // same id), we must include its entry in our write.
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
    // Index write failed AFTER all files are on disk. Clean up the
    // tree to avoid orphan files (files present but no index entry —
    // exactly the symptom we hit). Then re-throw so the caller knows
    // the install failed.
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

  // Verify the index round-trip: read it back and confirm our entry
  // is present. Same defense-in-depth pattern as the manifest verify.
  // If the index has been silently truncated or our entry is missing,
  // bail cleanly rather than reporting success on a phantom install.
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
  if (next.length === index.extensions.length) return; // not present
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
      // Manifest unparseable / file system error — extension is in a
      // broken state we can't recover from. Mark for purge so we don't
      // keep tripping over it on every boot.
      dlog(`  manifest load FAILED:`, err);
      console.warn(
        `[helium/extfs] loadExtensionsAtBoot: corrupt extension ${entry.id} (${(err as Error).message}); will purge`,
      );
      corruptIds.push(entry.id);
    }
  }

  // Atomic purge: remove the broken entries from the index in one pass,
  // then delete their trees. Order matters — if rmrf fails for some
  // reason, the index is already clean so we won't retry the bad path.
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

  // Orphan reconciler: find extension trees on disk that are NOT in the
  // index, then either re-index them (if manifest.json is valid) or
  // remove them. This recovers from interrupted installExtension calls
  // where files got written but writeIndex never ran (e.g., browser
  // killed mid-install, OPFS hiccup). Without this, the broken state
  // is silent forever — UI doesn't see the extension, but the tree is
  // still there taking up storage AND blocking re-install by the same
  // id (because removeExtensionTree only runs on re-install).
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
          // Re-create the index entry. We don't have the original
          // unpacker metadata (format, idFromKey) so fill in reasonable
          // defaults — the entry is still valid, just slightly less
          // accurate than a fresh install.
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
          // Add to the in-memory loaded list so this boot uses it
          // immediately without a reload.
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
