# Profile-Scoped Storage & Buckets — Proposal

Status: draft
Owners: storage/profiles
Supersedes: current `src/apis/data/*` + `src/apis/profiles/*` storage backing

## 0. TL;DR

- Replace the single shared `/data/*.json` NightFS store with **per-profile, bucket-isolated** storage.
- Backend is selected at boot: **Chrome Storage Buckets → OPFS subdirectory → IndexedDB shim**.
- Settings, session state, and profile blobs live as small JSON files inside a profile's own OPFS root.
- NightFS/TFS is retained but scoped to a subdirectory of a single profile bucket, so its unawaited `.TFS_STORE` writes cannot race a second TFS instance.
- Scramjet cache-plugin and proxied site storage move onto **per-origin buckets nested under the active profile**.
- ProfilesAPI stops being a snapshot-driven copy tool; it becomes a **switcher** over already-isolated storage roots. Import/export becomes a stream over one profile's tree.

This directly fixes the `NoModificationAllowedError` ("certain files are unsafe for access…") and eliminates the two data-integrity findings from the review (prototype-key collision, unnormalized values).

---

## 1. Goals

1. **Correctness**: eliminate the `.TFS_STORE` `createWritable` race and prototype-key bugs.
2. **Isolation**: a profile switch must not carry state across profiles at any layer — cookies, localStorage, IndexedDB, OPFS, Cache Storage.
3. **Concurrency**: independent profiles run in parallel; same-profile writes serialize per file.
4. **Compatibility**: works in Chromium (buckets), Firefox and Safari (OPFS fallback), and hostile environments without OPFS (IDB shim).
5. **Export/import**: profile state is a self-contained, versioned archive; import restores exactly what was exported.
6. **No hidden dependencies**: the SettingsAPI surface (`getItem` / `setItem` / `mergeItem` / `removeItem` / `clear` / `keys`) does not change for callers.

---

## 2. Current state (what breaks and why)

### 2.1 The `NoModificationAllowedError`

Chain (verified in code):

1. `StorageWorkerService.writeData` (`src/apis/data/storageWorkerService.ts:170-180`) serializes writes with `navigator.locks.request('daydream-storage:<filePath>', …)`.
2. That lock is scoped per **user file** (`settings.json`, `cache.json`, …). It does **not** cover NightFS/TFS's own `.TFS_STORE` writes.
3. Every TFS mutation (`fs/index.ts:354`, `:509`, `:1085`, `:1122`, `:1399`) fires `updMeta(this.handle, …)` **without await**. `updMeta` (`:90`) opens `.TFS_STORE` via `createWritable()`.
4. Two concurrent writes on different user files (settings vs cache) → two concurrent `.TFS_STORE` `createWritable()` handles → `NoModificationAllowedError`.
5. After fallback activates, `MainThreadStorage` (`mainThreadStorage.ts:78-86`) spawns a **second** TFS on the same OPFS root; every write is now guaranteed to race.

### 2.2 Data integrity findings (from prior review)

- **Prototype key collision** (`storageWorkerService.ts:93-110`): `data['constructor']` returns inherited `Function: Object`; `data['__proto__'] = value` mutates the prototype and `JSON.stringify` emits `{}`.
- **Unnormalized values** (`storageWorkerService.ts:107`): `setItem` returns `request.value` before JSON round-trip; `Date`, `undefined`, `NaN`, functions diverge from what `getItem` returns.

### 2.3 ProfilesAPI is a snapshot copier, not an isolation boundary

`ProfilesAPI` (`src/apis/profiles/ProfilesAPI.ts`) works by:

1. Reading the **live host** `document.cookie`, `localStorage`, and `indexedDB.databases()`.
2. Writing that blob into `/data/profiles.json` keyed by `userID`.
3. On switch: `clearAllCookies` + `clearAllLocalStorage` + `clearAllIDB`, then re-applying.

Problems:

- **Not actually isolated.** Every profile writes into the *same* host stores. "Switching" is a destructive copy. Any tab open during a switch sees corruption.
- **Race-prone.** Profile switch = ~6 async operations against the live host with no lock; `flushPendingChanges` is a bare `setTimeout(150)` (`browser/functions/profileManager.ts:995`).
- **Lossy.** `clearAllIDB` filters by `SYSTEM_DBS = ["Profiles", "ProfileIDB"]` (`constants.ts:1`); any DB not in the allowlist is wiped on switch. Proxied site DBs get destroyed.
- **Requires a reload on every switch** (`profileManager.ts:1041`), because live host state cannot be atomically swapped.
- **Emergency save** (`stateManager.ts:58-106`) dumps into `window.localStorage` under `__emergency_profile_backup_*` — polluting the host store the same code claims to isolate.
- **`__current_profile__` sentinel** is stored *as a profile key* in the same map as real profiles (`profileManager.ts:133`). `listProfiles()` returns it, then it's filtered ad-hoc in the UI.
- **Export** (`exportManager.ts:29-63`) captures live browser state, not the target profile's stored blob. Exporting profile B while on profile A silently exports A.
- **Deprecated encode/decode** (`exportManager.ts:65-77`) still shipped.

---

## 3. New architecture

### 3.1 The two boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  App code (SettingsAPI, ProfilesAPI, cache-plugin, …)           │
│  Talks ONLY to the ProfileStorage facade.                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  ProfileStorage facade                                          │
│  - resolves active profile                                      │
│  - routes reads/writes to that profile's StorageRoot            │
│  - serializes per-file writes with navigator.locks              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  StorageRoot backend (selected once at boot)                    │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ BucketBackend│  │ OpfsSubdirBack │  │ IdbShimBackend   │    │
│  │ (Chromium)   │  │ (FF/Safari)    │  │ (last resort)    │    │
│  └──────────────┘  └────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Core interfaces

```ts
// src/apis/data/profileStorage.ts
export interface StorageRoot {
	getDirectory(): Promise<FileSystemDirectoryHandle>;
	/** Undefined when the backend cannot supply an isolated CacheStorage. */
	caches?: CacheStorage;
	/** Undefined when the backend cannot supply an isolated IDBFactory. */
	indexedDB?: IDBFactory;
	readonly kind: 'bucket' | 'opfs-subdir' | 'idb-shim';
	readonly profileId: string;
}

export interface ProfileStorage {
	/** Resolves the storage root for a profile, creating it on first use. */
	getProfileRoot(profileId: string): Promise<StorageRoot>;
	/** Resolves the per-target-origin sub-root inside a profile. */
	getOriginRoot(profileId: string, targetOrigin: string): Promise<StorageRoot>;
	/** Removes a profile's entire storage tree; irreversible. */
	destroyProfile(profileId: string): Promise<void>;
	/** Enumerates profile ids the backend has physically created. */
	listPhysicalProfiles(): Promise<string[]>;
	readonly kind: 'bucket' | 'opfs-subdir' | 'idb-shim';
}
```

### 3.3 Backend selection

```ts
export async function createProfileStorage(): Promise<ProfileStorage> {
	if ((navigator as any).storageBuckets?.open) {
		return new BucketProfileStorage();
	}
	if (navigator.storage?.getDirectory) {
		return new OpfsSubdirProfileStorage();
	}
	return new IdbShimProfileStorage();
}
```

Logged once at boot: `[storage] backend=bucket|opfs-subdir|idb-shim`.

`Storage.persist()` is called in all three modes to reduce eviction pressure.

### 3.4 Bucket backend (Chromium)

Naming follows Starlight (`Starlight/src/storage-name.ts:3-13`) — deterministic 56-char SHA-256 slice.

```ts
const bucketKey = /* build-time seeded constant */;
async function bucketName(...parts: string[]): Promise<string> {
	const input = new TextEncoder().encode(
		[location.origin, bucketKey, ...parts].join(String.fromCharCode(0))
	);
	const digest = await crypto.subtle.digest('SHA-256', input);
	return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 56);
}
```

- Profile bucket: `bucketName('profile', profileId)`
- Origin bucket:  `bucketName('site', profileId, targetOrigin)`

Each bucket exposes `getDirectory()` (isolated OPFS), `caches` (isolated CacheStorage), and `indexedDB` (isolated IDBFactory). No collision with host or with other profiles.

### 3.5 OPFS-subdir backend (Firefox/Safari)

One shared OPFS root at `navigator.storage.getDirectory()`. Layout:

```
/
└── profiles/
    └── <sha56(profileId)>/
        ├── settings.json
        ├── session.json
        ├── profile.json          // metadata: name, appearance, timestamps
        ├── nightfs/              // scoped NightFS root, single writer
        │   └── .TFS_STORE, …
        └── sites/
            └── <sha56(targetOrigin)>/
                ├── cache.json    // scramjet cache-plugin index
                └── payloads/
```

`StorageRoot.caches` and `StorageRoot.indexedDB` are **undefined** here. Callers that need those must fall through to the shared host `caches` / `indexedDB` with key namespacing (`sha56(profileId + targetOrigin)` prefix) — same pattern as `Starlight/library/packages/controller/src/storage.ts:274-332`.

This is weaker isolation against DevTools scanning, but it's functionally correct and it still eliminates the concurrent-write bug because each profile has its own OPFS subtree with a single writer.

### 3.6 IDB-shim backend (last resort)

One IndexedDB database `daydream_storage`. Object stores: `files` (key = `${profileId}/${path}`, value = `Blob`), `metadata`. `getDirectory()` returns a `FileSystemDirectoryHandle`-shaped shim over that store; only the methods `StorageWorkerService` needs (`exists`, `mkdir`, `readFile`, `writeFile`) are implemented. NightFS is disabled in this mode.

### 3.7 Rewriting StorageWorkerService

- Drop the TFS dependency. `StorageFileSystem` is implemented directly against `FileSystemDirectoryHandle` (or the shim):
  - `exists`: try `getFileHandle`/`getDirectoryHandle`, catch `NotFoundError`.
  - `mkdir`: `getDirectoryHandle(name, { create: true })` recursively.
  - `readFile`: `getFileHandle` → `getFile` → `text()`.
  - `writeFile`: `getFileHandle(name, { create: true })` → `createWritable()` → `write` → `close`. No `.TFS_STORE` sidecar.
- Lock name becomes `daydream-storage:${profileId}:${filePath}` so different profiles never contend.
- Fix prototype-key bug: use a `Map` internally or `Object.create(null)`, and reject keys `__proto__` / `constructor` / `prototype` at the boundary (or accept them safely — but the safer default is to reject with a typed error).
- Fix value normalization: `setItem` and `mergeItem` return the value after `JSON.parse(JSON.stringify(value))` so what's returned matches what a subsequent `getItem` yields.
- NightFS stays available as a **separate service** for callers that actually need a POSIX-ish tree (large blobs, page cache staging). It is instantiated with `profileRoot.getDirectory().getDirectoryHandle('nightfs', { create: true })` so its `.TFS_STORE` is inside the profile's own tree and only one TFS instance ever writes there.

### 3.8 SharedWorker routing

`storage.shared-worker.ts` becomes a router:

```ts
const services = new Map<string, StorageWorkerService>();

function serviceFor(profileId: string): StorageWorkerService {
	let svc = services.get(profileId);
	if (!svc) {
		svc = new StorageWorkerService(getProfileFileSystem(profileId));
		services.set(profileId, svc);
	}
	return svc;
}
```

Requests now carry `profileId`. `MainThreadStorage` uses the identical routing. `ResilientStorage` closes the SharedWorker (per prior finding #4) before instantiating the main-thread fallback so the two never coexist.

---

## 4. ProfilesAPI redesign

### 4.1 New responsibilities

ProfilesAPI stops copying live browser state. Its job is now:

1. **Registry**: track which profile IDs exist and which is active.
2. **Metadata**: name, appearance, created/updated timestamps, version.
3. **Switch**: change the "active profile" pointer that `ProfileStorage.getProfileRoot` reads.
4. **Import/export**: stream a profile's tree to/from an archive.
5. **Destroy**: delete a profile's bucket/subdirectory.

It no longer touches `document.cookie`, host `localStorage`, or host `indexedDB.databases()`. Those are proxied per-profile through Scramjet + the origin bucket.

### 4.2 New type surface

```ts
// src/apis/profiles/types.ts (v3)
export interface ProfileMetadata {
	id: string;              // opaque, stable
	originalId?: string;     // set when imported with an id collision (auto-rename)
	name: string;            // user-visible, mutable
	appearance?: ProfileAppearance;
	createdAt: number;
	updatedAt: number;
	version: 3;
	// Enabled extensions for this profile. Full entries live in extensions/manifest.json;
	// this array is a fast-access summary for UI (icons, count).
	extensionSummary?: Array<{ id: string; version: string; enabled: boolean }>;
}

export interface ProfileRegistry {
	profiles: Record<string, ProfileMetadata>;
	activeProfileId: string | null;
	version: 3;
}

export interface ProfileArchiveV3 {
	format: 'daydream-profile';
	version: 3;
	metadata: ProfileMetadata;
	// Content-addressed file map, base64 payloads.
	files: Record<string, { encoding: 'utf8' | 'base64'; content: string }>;
	// Origin-scoped payloads (cookies, LS, IDB dumps from proxied sites).
	sites: Record<string /* targetOrigin */, {
		cookies?: Record<string, string>;
		localStorage?: Record<string, string>;
		sessionStorage?: Record<string, string>;
		indexedDB?: DatabaseExport[];
	}>;
}
```

Key changes vs current `ProfileData`:

- The **registry** and the **content** are separate concerns. Renaming, appearance, and active-pointer changes don't rewrite the whole content blob.
- The archive is **versioned** with a magic `format` field so future import can reject unknown shapes explicitly.
- Site data is keyed by target origin, so a profile can contain state for many sites without the ambiguous global cookies bag.
- `id` is opaque; `name` is user-visible. Renaming no longer rewrites storage keys or has to update `__current_profile__`.

### 4.3 New API

```ts
export class ProfilesAPI {
	constructor(
		private readonly storage: ProfileStorage,
		private readonly plan: { maxProfiles: number; canExceed?: () => Promise<boolean> },
	) {}

	async ready(): Promise<void>;

	// Registry
	async list(): Promise<ProfileMetadata[]>;
	async get(id: string): Promise<ProfileMetadata | null>;
	async create(input: { name: string; appearance?: ProfileAppearance }): Promise<ProfileMetadata>;
	async rename(id: string, name: string): Promise<ProfileMetadata>;
	async setAppearance(id: string, appearance: ProfileAppearance): Promise<ProfileMetadata>;
	async destroy(id: string): Promise<void>;

	// Active
	getActiveId(): string | null;
	async setActive(id: string): Promise<void>;   // atomic pointer swap; no host state copy

	// Data (per active profile; use ProfileStorage directly for other profiles)
	settings(): SettingsAPI;                       // scoped to active profile
	async clearActiveData(): Promise<void>;        // destroys and re-creates content, keeps metadata

	// Archive
	async export(id: string): Promise<ProfileArchiveV3>;
	async exportToBlob(id: string): Promise<Blob>;
	async import(archive: ProfileArchiveV3, opts?: { rename?: string }): Promise<ProfileMetadata>;
	async importFromBlob(blob: Blob, opts?: { rename?: string }): Promise<ProfileMetadata>;

	// Compat shims (deprecated; call sites migrate incrementally)
	/** @deprecated use list() */
	async listProfiles(): Promise<string[]>;
	/** @deprecated use setActive() */
	async switchProfile(id: string): Promise<boolean>;
	/** @deprecated use export()/import() */
	async downloadExport(filename?: string): Promise<boolean>;
}
```

### 4.4 Switching is a pointer swap + coordinated reload

Because each profile owns its bucket/subdirectory, `setActive(id)` is:

1. Persist the new `activeProfileId` in the app-level registry (its own file, outside any profile bucket).
2. Post `{ type: 'active-changed', id }` on `BroadcastChannel('daydream-profiles')` so every tab, worker, and iframe hears the swap at the same instant.
3. Each listener performs an **active reload**: it re-resolves its `StorageRoot`, re-registers proxy transports, re-applies themes, and re-attaches the per-profile extension host (§6.5). Interface state (open tabs, layout, unsaved input in the shell chrome) is preserved — the shell does not call `location.reload()`.
4. Proxied iframes are reloaded through Scramjet's controller (so target pages see a fresh document with the new profile's cookies/LS/IDB), not through the top-level shell.
5. Long-lived consumers that cannot handle a live swap (rare) may opt in to a forced hard reload via `ProfilesAPI.setActive(id, { hardReload: true })`.

The legacy `location.reload()` on switch (`src/browser/functions/profileManager.ts:1041`) is removed.

### 4.5 Cleaner registry storage

Registry lives at OPFS root `registry.json` (bucket backend: a dedicated `app` bucket per Starlight's pattern). `__current_profile__` is no longer a peer of profile IDs in a shared map.

### 4.6 Emergency-save fix

Current emergency-save writes into `window.localStorage`, which is the host store. Replace with a synchronous best-effort write into the profile's OPFS via `navigator.locks.request(..., { mode: 'shared', ifAvailable: true })` and a queued fallback. If storage is truly unavailable, log; do not silently taint the host.

---

## 5. Per-profile extension host

Extensions today load globally (`src/apis/extensions.ts`). Under v3 they become **installed once, enabled per profile**.

### 5.1 Storage layout

Two distinct trees:

```
/app-bucket/                      (shared across profiles)
└── extensions/
    └── <extensionId>/
        └── <version>/            content-addressed, immutable
            ├── manifest.json
            ├── background.js
            ├── icons/
            └── ...

/profile-bucket/<profileId>/
└── extensions/
    ├── manifest.json             { enabled: [{id, version, grants}], disabled: [...] }
    └── state/
        └── <extensionId>/
            ├── storage.local.json    chrome.storage.local
            ├── storage.session.json  chrome.storage.session (also cleared on reload)
            └── idb/                  chrome-extension IDB shim payloads
```

- Extension **code and assets** live once in the shared app bucket, content-addressed by `extensionId + version`. Installing the same extension into a second profile is free.
- Extension **state** (settings, cookies, tokens, background state) lives inside the profile bucket. Never leaks across profiles.
- The profile's `extensions/manifest.json` is the source of truth for which extensions run in that profile. It records `{ id, version, grants, installedAt, updatedAt }` per enabled extension plus a `disabled` list for extensions installed to the profile but currently off.

### 5.2 Boot / activation flow

1. On `setActive(id)`, the extension host receives the same BroadcastChannel event as everything else.
2. Host tears down every currently running extension worker/content-script bridge.
3. Host reads `profileRoot/extensions/manifest.json`, filters to the `enabled` list.
4. For each enabled entry, host resolves `/app-bucket/extensions/<id>/<version>/` (installing on demand from the extension store if the version is missing), spawns its background service worker, and re-registers `chrome.storage.*` / `chrome.runtime.*` / etc. against `profileRoot/extensions/state/<id>/`.
5. `chrome.identity.getProfileUserInfo` (already routed in `src/apis/extensions.ts:344,2527`) reads from the active profile metadata.
6. Content-script injection for proxied tabs is gated on the active profile's manifest — a tab created before the switch that survives the reload gets its content scripts re-injected from the new profile's set.

### 5.3 New ProfilesAPI surface for extensions

```ts
interface ProfileExtensionEntry {
	id: string;
	version: string;
	enabled: boolean;
	grants: string[];             // host permissions granted in this profile
	installedAt: number;
	updatedAt: number;
}

class ProfilesAPI {
	// ...
	async listExtensions(profileId?: string): Promise<ProfileExtensionEntry[]>;
	async installExtension(profileId: string, source: ExtensionSource): Promise<ProfileExtensionEntry>;
	async setExtensionEnabled(profileId: string, extensionId: string, enabled: boolean): Promise<void>;
	async uninstallExtension(profileId: string, extensionId: string): Promise<void>;
	async updateExtensionGrants(profileId: string, extensionId: string, grants: string[]): Promise<void>;
}
```

`ExtensionSource` is a union of `{ type: 'crx', blob: Blob }`, `{ type: 'unpacked', directory: FileSystemDirectoryHandle }`, or `{ type: 'store', id: string, version?: string }`. Install writes the package into the shared app bucket (dedup by content hash of the crx) and appends an entry to the target profile's manifest.

### 5.4 Archive integration

`ProfileArchiveV3` gains an `extensions` field:

```ts
extensions: {
	manifest: { enabled: ProfileExtensionEntry[]; disabled: ProfileExtensionEntry[] };
	state: Record<string /* extensionId */, {
		storageLocal?: Record<string, unknown>;
		idb?: DatabaseExport[];
	}>;
	// Packages themselves are NOT embedded by default — the archive references them by
	// { id, version, sha256 } and reinstalls from the extension store on import.
	// exportToBlob({ includePackages: true }) inlines the crx bytes for offline import.
}
```

On `import`: for each enabled entry, look up the package in the local app bucket → if missing and packages were embedded, install from the archive → if missing and not embedded, install from the store → if still missing, mark the entry `disabled` with `reason: 'package-unavailable'` so the user can resolve it later.

### 5.5 Compatibility

- Existing globally-loaded extensions on v2 migrate into the active profile's manifest on first v3 boot (see §7.1). Their `chrome.storage.local` is copied into `profileRoot/extensions/state/<id>/storage.local.json` and the global chrome-extension IDBs move into the same subtree.
- The `chrome.extension.*` and `chrome.runtime.*` router in `src/apis/extensions.ts` gains an active-profile check: calls originating from an extension not in the active profile's enabled list are rejected with `runtime.lastError = 'Extension not enabled in this profile'`.

---

## 6. Scramjet cache-plugin & site cache

- Cache-plugin resolves `ProfileStorage.getOriginRoot(activeProfileId, targetOrigin)`.
- With bucket backend: writes go to `originRoot.caches` (isolated) — never touches the host CacheStorage.
- Without bucket backend: writes go to the shared host `caches` under key prefix `sha56(profileId + targetOrigin)`. Reads scope to the same prefix.
- Proxied IndexedDB analogously uses `originRoot.indexedDB` when available.

This matches Starlight's approach (`Starlight/library/packages/controller/src/storage.ts:274-332`) and keeps the fingerprint story consistent.

---

## 7. Compatibility matrix

| Feature                       | Chromium (buckets) | Firefox / Safari (OPFS)  | No-OPFS (IDB shim) |
|-------------------------------|--------------------|--------------------------|---------------------|
| Per-profile OPFS files        | ✅ isolated bucket | ✅ subdirectory          | ✅ IDB blob store   |
| Per-profile IndexedDB         | ✅ bucket.indexedDB| ⚠️ shared, key-prefixed  | ❌ n/a              |
| Per-profile CacheStorage      | ✅ bucket.caches   | ⚠️ shared, key-prefixed  | ❌ n/a              |
| NightFS available             | ✅ scoped          | ✅ scoped                | ❌ disabled         |
| Concurrent-write safety       | ✅                 | ✅                       | ✅                  |
| Per-profile quota             | ✅ (browser-managed)| ⚠️ shared quota          | ⚠️ shared quota     |
| Profile switch without reload | ✅                 | ✅                       | ✅                  |
| Export/import                 | ✅                 | ✅                       | ✅                  |

---

## 8. Migration

### 8.1 Legacy `/data/settings.json` and `/data/profiles.json`

One-shot on first boot after upgrade:

1. Read legacy `/data/profiles.json` via NightFS (last time we ever touch that path).
2. For each entry that is a real profile (skip `__current_profile__`):
   - `create({ name: entry.appearance?.name ?? id })` → new opaque id.
   - Write the entry's `cookies`, `localStorage`, `indexedDB` payloads into `sites['*']` of the new profile as legacy "global" origin.
3. Migrate `__current_profile__` → `registry.activeProfileId`.
4. Migrate legacy `/data/settings.json` into the new active profile's `settings.json` (direct OPFS, no TFS).
5. Write `MIGRATED_TO_V3` marker; on subsequent boots, skip.

Only delete legacy paths after both the marker and the new files verify (`exists` + non-empty).

### 8.2 Existing exported JSONs

`import()` detects `format !== 'daydream-profile'` and runs the v2 → v3 converter (same shape as the migration step above). Old exports remain usable indefinitely.

---

## 9. Export / import behavior

- **Deterministic**: exporting the same profile twice with no intervening writes produces byte-identical archives (stable key order, sorted origin keys).
- **Complete**: settings, session, appearance, per-origin cookies/LS/SS/IDB, and any user files under `nightfs/` are included.
- **Portable**: no absolute paths, no bucket names, no host origin. An archive from Chromium imports cleanly on Firefox and vice versa.
- **Safe**: import writes to a temporary profile id first, then atomically renames into the registry on success. A failed import cannot corrupt an existing profile.
- **Sized**: `exportToBlob` streams into a Blob to avoid holding the whole archive in memory for large profiles.
- **Optional encryption** (future): the archive envelope allows an `encryption` field; v3 payloads are unencrypted. Adding AES-GCM later is a version bump, not a breaking change.

The deprecated `encode`/`decode` methods in `exportManager.ts` are removed.

---

## 10. File layout after the change

```
src/apis/data/
├── PROPOSAL.md                 (this file)
├── profileStorage.ts           facade + createProfileStorage()
├── profileBroadcast.ts         BroadcastChannel('daydream-profiles') pub/sub
├── backends/
│   ├── bucketBackend.ts        Chromium
│   ├── opfsSubdirBackend.ts    Firefox/Safari
│   └── idbShimBackend.ts       last resort
├── storageWorkerProtocol.ts    (adds profileId to request shape)
├── storageWorkerService.ts     (drops TFS; direct OPFS)
├── storageWorkerClient.ts      (unchanged surface, adds profileId)
├── mainThreadStorage.ts        (routes via profileStorage)
├── resilientStorage.ts         (closes shared worker before fallback)
├── storage.shared-worker.ts    (per-profile service router)
├── nightfsScoped.ts            (thin wrapper: NightFS on a subdir handle)
└── legacyMigration.ts          one-shot v2 → v3

src/apis/profiles/
├── index.ts                    barrel
├── ProfilesAPI.ts              new v3 surface
├── registry.ts                 registry file I/O
├── archive.ts                  export/import + v2 → v3 converter
├── metadata.ts                 ProfileMetadata helpers
├── extensions.ts               per-profile extension host (§5)
├── types.ts                    v3 types (retain v2 types marked @deprecated)
├── constants.ts                (SYSTEM_DBS removed; PROFILE_VERSION = 3)
└── compat.ts                   deprecated method shims that map to v3
```

Extension-host wiring in `src/apis/extensions.ts` gains a thin adapter that reads the active profile's manifest via `ProfilesAPI` and gates every dispatch on it. The shared app-bucket extension package cache is owned by `src/apis/profiles/extensions.ts`.

`src/apis/profiles/stateManager.ts`, `exportManager.ts`, `profileManager.ts`, and `storage/{cookies,localStorage,indexedDB}.ts` are deleted after the callsites migrate — they only make sense in the "copy live host state" model.

`src/browser/functions/profileManager.ts` keeps its UI but its handlers switch to the new API (no more forced reload on switch, no more emergency-save into `localStorage`).

---

## 11. Concrete fixes this proposal delivers

| Issue                                                              | Fix                                                                             |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `NoModificationAllowedError` on concurrent `.TFS_STORE`             | Direct OPFS in `StorageWorkerService`; NightFS scoped to one subdir per profile |
| Prototype-key collision (`constructor`, `__proto__`)                | Null-prototype record + reserved-key rejection                                  |
| `setItem` returns pre-serialization value                           | Round-trip through `JSON.parse(JSON.stringify(v))` before returning             |
| `MainThreadStorage` + SharedWorker race on same TFS root            | `ResilientStorage` closes SharedWorker before creating fallback                 |
| `activateFallback` leaks partially-constructed port                 | Wrap `new StorageWorkerClient` in try/catch, close port on throw                |
| Profile switch = reload + destructive host wipe                     | Profile switch = pointer swap; no reload required                               |
| `__current_profile__` is a peer of profile IDs                      | Dedicated `registry.json`                                                       |
| `SYSTEM_DBS` allowlist destroys unknown site DBs                    | Per-origin buckets; no cross-profile mutation to filter                         |
| Export captures live state, not the target profile                  | `export(id)` reads the profile's own tree                                       |
| Deprecated `encode`/`decode`                                        | Removed                                                                         |
| Emergency save pollutes `window.localStorage`                       | Best-effort OPFS write with `navigator.locks` `ifAvailable`                     |
| Bare `setTimeout(150)` as "flush"                                   | Real awaited flush against the SharedWorker's queue                             |
| Rename requires rewriting profile key + `__current_profile__`       | `id` is opaque; only `name` changes                                             |

---

## 12. Implementation plan (phases)

1. **Land backends without touching ProfilesAPI.**
   - Add `profileStorage.ts` + three backends.
   - Rewrite `StorageWorkerService` to direct OPFS, keyed by `profileId` (default `'default'`).
   - Update `MainThreadStorage`, `storage.shared-worker.ts`, `ResilientStorage` to route by `profileId`.
   - `SettingsAPI` gains an optional `profileId` (defaulting to active). Existing callers keep working.
   - Tests: prototype-key rejection, value round-trip, concurrent multi-file writes, fallback close-before-open, Firefox/Safari subdir simulation via a mock backend.

2. **Land v3 ProfilesAPI in parallel with v2 shims.**
   - New `registry.ts`, `archive.ts`, `metadata.ts`.
   - `compat.ts` maps v2 methods to v3.
   - `stateManager.ts` and legacy storage/* files marked `@deprecated`.

3. **Migrate UI callsites (`src/browser/functions/profileManager.ts`, `src/pages/settings/**`).**
   - Drop forced reloads.
   - Use `settings()` scoped to active profile.

4. **Legacy migration + delete old files.**
   - `legacyMigration.ts` runs on first v3 boot.
   - Once metrics show <1% of clients still on v2 markers, delete `stateManager.ts`, `exportManager.ts`, legacy `profileManager.ts`, `storage/*.ts`.

5. **Cache-plugin integration.**
   - Scramjet cache-plugin swaps its `caches.open` for `originRoot.caches?.open(...) ?? host caches.open(prefixed)`.

---

## 13. Testing strategy

- **Unit** (existing vitest surface):
  - Backend contract tests: same suite runs against all three backends.
  - Reserved-key rejection: `getItem('__proto__')`, `setItem('constructor', v)`.
  - Value round-trip: `Date`, `NaN`, `undefined`, functions.
  - Concurrent multi-file writes across profiles do not throw `NoModificationAllowedError` (simulated OPFS mock exercises the same `createWritable` semantics).

- **Integration** (Playwright, extend `tests/render-playwright.spec.ts`):
  - Add assertions on `pageErrors` (no unexpected page errors) and an allowlist for expected `failedRequests` — fixes prior review finding #3.
  - Two-profile scenario: write in A, switch to B, verify empty; switch back, verify A intact.
  - Reload persistence per profile.
  - Cross-page (`context.newPage()`) sees the same active profile.

- **Default-factory assertions** (fixes prior review finding #5):
  - Test the actual `defaultSharedWorkerFactory` selects `daydream-storage`, `type: 'module'`, `./storage.shared-worker.ts`.

- **Fallback isolation** (fixes prior finding #4):
  - Force `new StorageWorkerClient` to throw; assert the port passed to the factory has `close()` called.

---

## 14. Resolved decisions

1. **Bucket key.** One single build-time constant, injected the same way Starlight does (`buildConfig.storage.bucketKey`). Not rotated per install.
2. **Quota.** No per-profile quota is requested. Browser-managed storage pressure only. UI does not surface a soft cap.
3. **Cross-tab active-profile changes.** `BroadcastChannel('daydream-profiles')` fires an active reload in every listener (§4.4): storage roots re-resolve, proxy transports re-register, themes re-apply, extension host re-activates the new profile's manifest. Shell interface state is preserved; no `location.reload()` in the shell. Proxied iframes reload through the Scramjet controller.
4. **Encryption of archives.** Deferred. The envelope reserves an `encryption` field; v3 payloads ship unencrypted.
5. **Import conflicts.** Auto-rename. Original id is preserved as `metadata.originalId` on the imported profile for traceability.
6. **Extensions.** Per §5: installed once into a shared app bucket, enabled per profile via each profile's own `extensions/manifest.json`. Extension state lives inside the profile bucket. Switching profiles tears down the previous set and activates the new one.

---

## 15. Acceptance criteria

- No `NoModificationAllowedError` observed under stress test (100 concurrent `settings.setItem` calls across 3 profiles, 10 origins, 60 seconds).
- Two-profile switch retains full data on both sides with no reload, no host `localStorage`/`cookie`/IDB mutation observed in DevTools between switches.
- Export → destroy → import produces a profile whose `settings.getItem` values, cookies, LS, and IDB records match the pre-destroy snapshot byte-for-byte.
- Firefox and Safari (opfs-subdir backend) pass the same integration suite as Chromium, minus the isolated-caches/IDB assertions.
- Full test suite green (currently 450 pass + 2 unrelated `channel.test.ts` / `windows.test.ts` failures — those remain out of scope).
