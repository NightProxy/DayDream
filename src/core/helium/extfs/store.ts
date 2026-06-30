import { NightFS } from '@apis/data/fs';
import type { FSType } from '@terbiumos/tfs';

import { dirname, EXT_ROOT, INDEX_PATH, extPath } from './path';
import type { ExtensionIndex } from './types';

const DBG_TAG = '[helium/extfs/dbg]';
function dlog(...args: unknown[]): void {
  console.log(DBG_TAG, ...args);
}

const fsState: {
  store: FSType | null;
  ready: Promise<FSType> | null;
} = {
  store: null,
  ready: null,
};

function exists(store: FSType, path: string): Promise<boolean> {
  return new Promise(resolve => {
    store.exists(path, resolve);
  });
}

function mkdir(store: FSType, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.mkdir(path, err => {
      if (!err) return resolve();
      const code = (err as { code?: string }).code;
      const name = (err as { name?: string }).name;
      if (code === 'EEXIST' || name === 'EEXIST') return resolve();
      reject(err);
    });
  });
}

/**
 * `mkdir -p` over the TFS callback API. Serialized via opQueue at
 * the call sites (writeExtensionFile, writeIndex) — concurrent OPFS
 * file handle acquisition throws NotReadableError, which we avoid by
 * pushing every file op through the queue.
 */
async function ensureDir(store: FSType, path: string): Promise<void> {
  if (path === '/' || path === '') return;
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    if (await exists(store, current)) continue;
    await mkdir(store, current);
  }
}

/**
 * Serial queue for OPFS operations.
 *
 * OPFS' FileSystemSyncAccessHandle (used internally by TFS) is
 * exclusive — only one handle per file can exist at a time. When two
 * file operations on the SAME backend run concurrently, the second
 * throws `NotReadableError: The requested file could not be read,
 * typically due to permission problems...`. The browser doesn't
 * queue; it just fails the second caller.
 *
 * TFS itself doesn't serialize either (its callbacks fire immediately
 * from microtasks). So when installExtension awaits writeExtensionFile
 * in a loop, the previous write's handle may not yet be released by
 * the time the next ensureDir starts probing for a directory.
 *
 * We sidestep all of that by pushing every store-mutating op through
 * a single Promise-chain queue. Reads can still race in parallel
 * (they only acquire read locks), but they're routed through the
 * queue too for simplicity.
 */
let opQueue: Promise<unknown> = Promise.resolve();
function queueOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = opQueue.then(fn, fn);
  opQueue = next.catch(() => undefined);
  return next;
}

function readFileBinary(store: FSType, path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    store.readFile(path, 'arraybuffer', (err, content) => {
      if (err) {
        dlog(`readFileBinary(${path}): TFS readFile errored:`, err);
        reject(err);
        return;
      }
      if (content instanceof Uint8Array) {
        dlog(`readFileBinary(${path}): TFS returned Uint8Array of ${content.byteLength} bytes`);
        resolve(content);
        return;
      }
      if (content instanceof ArrayBuffer) {
        dlog(`readFileBinary(${path}): TFS returned ArrayBuffer of ${content.byteLength} bytes`);
        resolve(new Uint8Array(content));
        return;
      }
      dlog(`readFileBinary(${path}): TFS returned UNEXPECTED type ${typeof content}: ${String(content).slice(0, 80)}`);
      reject(new Error(`[helium/extfs] readFileBinary(${path}): unexpected return type from TFS readFile: ${typeof content}`));
    });
  });
}

function writeFileBinaryRaw(
  store: FSType,
  path: string,
  content: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    dlog(`writeFileBinaryRaw(${path}): calling TFS writeFile with ${content.byteLength} bytes`);
    store.writeFile(path, content, err => {
      if (err) {
        dlog(`writeFileBinaryRaw(${path}): TFS writeFile errored:`, err);
        reject(err);
      } else {
        dlog(`writeFileBinaryRaw(${path}): TFS writeFile OK`);
        resolve();
      }
    });
  });
}

function unlink(store: FSType, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.unlink(path, err => {
      if (!err) return resolve();
      const code = (err as { code?: string }).code;
      const name = (err as { name?: string }).name;
      if (code === 'ENOENT' || name === 'ENOENT') return resolve();
      reject(err);
    });
  });
}

/**
 * Idempotent file write. TFS' `writeFile` can throw EEXIST in
 * pathological OPFS states (lingering FileSystemSyncAccessHandle on
 * a previously-written file that hasn't been GC'd yet, or a stale
 * directory entry where a file should be). When that happens we
 * unlink first and retry once. Mirrors the philosophy of `mkdir -p`:
 * the post-condition is "this file has these bytes", and we make it
 * so regardless of preceding state.
 */
async function writeFileBinary(
  store: FSType,
  path: string,
  content: Uint8Array,
): Promise<void> {
  try {
    await writeFileBinaryRaw(store, path, content);
    return;
  } catch (err) {
    const code = (err as { code?: string }).code;
    const name = (err as { name?: string }).name;
    if (code !== 'EEXIST' && name !== 'EEXIST') {
      dlog(`writeFileBinary(${path}) failed with non-EEXIST (code=${code}, name=${name})`);
      console.error(
        `[helium/extfs] writeFileBinary(${path}) failed (code=${code}, name=${name}):`,
        err,
      );
      throw err;
    }
    dlog(`writeFileBinary(${path}) hit EEXIST; unlinking and retrying`);
    console.warn(
      `[helium/extfs] writeFileBinary(${path}) hit EEXIST; unlinking and retrying`,
    );
    await unlink(store, path);
    await writeFileBinaryRaw(store, path, content);
    dlog(`writeFileBinary(${path}) retry succeeded`);
  }
}

function readFileUtf8(store: FSType, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    store.readFile(path, 'utf8', (err, content) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(content as string);
    });
  });
}

function writeFileUtf8Raw(
  store: FSType,
  path: string,
  content: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.writeFile(path, content, 'utf8', err =>
      err ? reject(err) : resolve(),
    );
  });
}

/** Idempotent UTF-8 file write. See `writeFileBinary` for rationale. */
async function writeFileUtf8(
  store: FSType,
  path: string,
  content: string,
): Promise<void> {
  try {
    await writeFileUtf8Raw(store, path, content);
    return;
  } catch (err) {
    const code = (err as { code?: string }).code;
    const name = (err as { name?: string }).name;
    if (code !== 'EEXIST' && name !== 'EEXIST') {
      console.error(
        `[helium/extfs] writeFileUtf8(${path}) failed (code=${code}, name=${name}):`,
        err,
      );
      throw err;
    }
    console.warn(
      `[helium/extfs] writeFileUtf8(${path}) hit EEXIST; unlinking and retrying`,
    );
    await unlink(store, path);
    await writeFileUtf8Raw(store, path, content);
  }
}

function readdir(store: FSType, path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    store.readdir(path, (err, files) => {
      if (err) reject(err);
      else resolve(files);
    });
  });
}

interface FsStat {
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK';
  isDirectory: () => boolean;
  isFile: () => boolean;
}

function stat(store: FSType, path: string): Promise<FsStat | null> {
  return new Promise(resolve => {
    store.stat(path, (err, stats) => {
      if (err || !stats) {
        resolve(null);
        return;
      }
      resolve(stats as unknown as FsStat);
    });
  });
}

function rmdirShallow(store: FSType, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.rmdir(path, err => (err ? reject(err) : resolve()));
  });
}

/**
 * Recursive delete. TFS's `rmdir(path, { recursive: true })` IGNORES
 * the recursive option (see node_modules/@terbiumos/tfs rmdir impl —
 * it just calls `dirHandle.removeEntry(name)` without `{recursive:true}`).
 * That throws `InvalidModificationError` on a non-empty directory,
 * which TFS maps to EEXIST. So we have to do it ourselves: depth-first
 * walk, unlink files / rmdir empty dirs, then rmdir the root.
 *
 * Idempotent: silently succeeds if `path` doesn't exist.
 *
 * EEXIST on the final rmdirShallow is also tolerated as a soft-success:
 * the directory contents were just removed, so any "non-empty" complaint
 * from OPFS is most likely a stale handle / eventual-consistency lag
 * inside the browser's storage layer. We retry once after a microtask
 * tick — if that still fails, we swallow EEXIST (NOT other codes) and
 * log. The post-condition callers care about ("the tree at `path` is
 * gone") is best-effort here: a stuck empty directory left behind is
 * harmless because future installs to the same id will see it and reuse
 * it, while propagating EEXIST would break every re-install with a
 * misleading "file already exists" message in the UI.
 */
async function rmrf(store: FSType, path: string): Promise<void> {
  const st = await stat(store, path);
  if (!st) return;
  if (st.type === 'DIRECTORY') {
    let entries: string[];
    try {
      entries = await readdir(store, path);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOENT') return;
      throw err;
    }
    for (const name of entries) {
      await rmrf(store, `${path}/${name}`);
    }
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await rmdirShallow(store, path);
        return;
      } catch (err) {
        const code = (err as { code?: string }).code;
        const name = (err as { name?: string }).name;
        if (code === 'ENOENT' || name === 'ENOENT') return;
        if (code === 'EEXIST' || name === 'EEXIST') {
          lastErr = err;
          await new Promise(resolve => setTimeout(resolve, 0));
          continue;
        }
        throw err;
      }
    }
    console.warn(
      `[helium/extfs] rmrf: directory "${path}" still reports non-empty after recursive cleanup; leaving empty shell behind. Last error:`,
      lastErr,
    );
    return;
  }
  try {
    await unlink(store, path);
  } catch (err) {
    const code = (err as { code?: string }).code;
    const name = (err as { name?: string }).name;
    if (code === 'ENOENT' || name === 'ENOENT') return;
    throw err;
  }
}

/**
 * Singleton NightFS accessor. Ensures `/extensions/` exists.
 * Same pattern as `src/core/sw/cache.ts`.
 */
export async function getStore(): Promise<FSType> {
  if (fsState.store) return fsState.store;
  if (!fsState.ready) {
    dlog(`getStore: initializing NightFS + ensuring ${EXT_ROOT}`);
    fsState.ready = (async () => {
      const nfs = new NightFS();
      await nfs.init;
      const store = nfs.core.fs;
      try {
        await ensureDir(store, EXT_ROOT);
        dlog(`getStore: ${EXT_ROOT} ensured`);
      } catch (err) {
        const code = (err as { code?: string }).code;
        const name = (err as { name?: string }).name;
        if (code !== 'EEXIST' && name !== 'EEXIST') {
          dlog(`getStore: ensureDir(${EXT_ROOT}) failed with non-EEXIST:`, err);
          throw err;
        }
        dlog(`getStore: ${EXT_ROOT} already exists (EEXIST suppressed)`);
      }
      fsState.store = store;
      return store;
    })();
  }
  return fsState.ready;
}

/**
 * Read the index. Returns an empty index on missing file, corrupt
 * JSON, or unknown schema version (all log a warning).
 */
export async function readIndex(): Promise<ExtensionIndex> {
  return queueOp(async () => {
    const store = await getStore();
    const empty: ExtensionIndex = { version: 1, extensions: [] };
    const indexExists = await exists(store, INDEX_PATH);
    dlog(`readIndex: ${INDEX_PATH} exists=${indexExists}`);
    if (!indexExists) {
      dlog(`readIndex: returning empty index (no _index.json on disk)`);
      return empty;
    }
    let raw: string;
    try {
      raw = await readFileUtf8(store, INDEX_PATH);
      dlog(`readIndex: raw bytes length=${raw.length}; first 200 chars: ${raw.slice(0, 200)}`);
    } catch (err) {
      dlog(`readIndex: readFileUtf8 FAILED:`, err);
      console.warn('[helium/extfs] store: failed to read index:', err);
      return empty;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      dlog(`readIndex: JSON.parse FAILED on raw:`, raw);
      console.warn('[helium/extfs] store: index JSON is corrupt:', err);
      return empty;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as ExtensionIndex).version !== 1 ||
      !Array.isArray((parsed as ExtensionIndex).extensions)
    ) {
      dlog(`readIndex: unknown shape/version — parsed:`, parsed);
      console.warn(
        '[helium/extfs] store: index has unknown shape or version, treating as empty',
      );
      return empty;
    }
    const idx = parsed as ExtensionIndex;
    dlog(`readIndex: parsed ${idx.extensions.length} entries; ids=${idx.extensions.map(e => e.id).join(',')}`);
    return idx;
  });
}

export async function writeIndex(index: ExtensionIndex): Promise<void> {
  return queueOp(async () => {
    dlog(`writeIndex: writing ${index.extensions.length} entries: ${index.extensions.map(e => e.id).join(',')}`);
    const store = await getStore();
    await ensureDir(store, EXT_ROOT);
    const json = JSON.stringify(index, null, 2);
    try {
      await writeFileUtf8(store, INDEX_PATH, json);
      dlog(`writeIndex: wrote ${json.length} bytes to ${INDEX_PATH}`);
    } catch (err) {
      dlog(`writeIndex: writeFileUtf8 FAILED:`, err);
      throw err;
    }
  });
}

/**
 * Write one file inside an extension's tree. Auto-creates parent
 * directories. Serialized through opQueue so concurrent writes don't
 * fight over OPFS file handles.
 */
export async function writeExtensionFile(
  id: string,
  rel: string,
  bytes: Uint8Array,
): Promise<void> {
  return queueOp(async () => {
    const store = await getStore();
    const full = extPath(id, rel);
    dlog(`writeExtensionFile: ${full} (${bytes.byteLength} bytes)`);
    try {
      await ensureDir(store, dirname(full));
      await writeFileBinary(store, full, bytes);
    } catch (err) {
      dlog(`writeExtensionFile: ${full} FAILED:`, err);
      throw err;
    }
  });
}

/**
 * Read one file inside an extension's tree. Returns `null` if the
 * file doesn't exist (per the public contract on `readExtensionFile`).
 */
export async function readExtensionFileRaw(
  id: string,
  rel: string,
): Promise<Uint8Array | null> {
  return queueOp(async () => {
    const store = await getStore();
    const full = extPath(id, rel);
    const present = await exists(store, full);
    if (!present) {
      dlog(`readExtensionFileRaw: ${full} does not exist`);
      return null;
    }
    try {
      const bytes = await readFileBinary(store, full);
      dlog(`readExtensionFileRaw: ${full} → ${bytes.byteLength} bytes`);
      return bytes;
    } catch (err) {
      dlog(`readExtensionFileRaw: ${full} read FAILED:`, err);
      console.warn(
        `[helium/extfs] store: failed to read ${full}:`,
        err,
      );
      return null;
    }
  });
}

/**
 * Recursive delete of an extension's entire tree. Idempotent —
 * silently no-ops if the tree doesn't exist.
 */
export async function removeExtensionTree(id: string): Promise<void> {
  return queueOp(async () => {
    const store = await getStore();
    const root = `${EXT_ROOT}/${id}`;
    const present = await exists(store, root);
    dlog(`removeExtensionTree: ${root} exists=${present}`);
    if (!present) return;
    await rmrf(store, root);
    dlog(`removeExtensionTree: ${root} removed`);
  });
}

/**
 * List the immediate subdirectories under `/extensions/`. Excludes
 * `_index.json` and anything starting with `_`. Returned names are
 * extension IDs (32 char a-z lowercase, but we don't validate shape
 * here — caller does that if needed).
 *
 * Used by the boot-time reconciler to find orphan trees (files
 * present in extfs but no entry in `_index.json`). Without this we
 * can't recover from an interrupted writeIndex — the tree would
 * silently leak forever.
 */
export async function listExtensionTrees(): Promise<string[]> {
  return queueOp(async () => {
    const store = await getStore();
    const rootExists = await exists(store, EXT_ROOT);
    dlog(`listExtensionTrees: ${EXT_ROOT} exists=${rootExists}`);
    if (!rootExists) return [];
    let names: string[];
    try {
      names = await new Promise<string[]>((resolve, reject) => {
        store.readdir(EXT_ROOT, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });
    } catch (err) {
      dlog(`listExtensionTrees: readdir(${EXT_ROOT}) FAILED:`, err);
      throw err;
    }
    dlog(`listExtensionTrees: raw readdir returned ${names.length} entries:`, names);
    const filtered = names.filter(n => !n.startsWith('_'));
    dlog(`listExtensionTrees: after _-prefix filter: ${filtered.length} entries:`, filtered);
    return filtered;
  });
}
