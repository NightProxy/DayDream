
import { SettingsAPI } from '@apis/settings';
import type { ChromeManifest, FirefoxManifest } from '@core/helium';

export type OverrideKind = 'newtab' | 'bookmarks' | 'history';
export const OVERRIDE_KINDS: readonly OverrideKind[] = ['newtab', 'bookmarks', 'history'] as const;

const SETTINGS_KEY = 'extensionUrlOverrides';

interface OverrideSlot {
  newtab?: string;
  bookmarks?: string;
  history?: string;
}

interface PersistedState {
  active: OverrideSlot;
  pending: OverrideSlot;
  declined: { newtab?: string[]; bookmarks?: string[]; history?: string[] };
}

/**
 * Read `chrome_url_overrides.<kind>` from a manifest. Returns null if
 * the manifest doesn't declare that override. Path is the manifest-
 * relative HTML path (e.g. "newtab.html").
 */
export function readManifestOverride(
  manifest: ChromeManifest | FirefoxManifest,
  kind: OverrideKind,
): string | null {
  const overrides = (manifest as { chrome_url_overrides?: Record<string, string> })
    .chrome_url_overrides;
  if (!overrides || typeof overrides !== 'object') return null;
  const path = overrides[kind];
  if (typeof path !== 'string' || path.length === 0) return null;
  return path.replace(/^\/+/, '');
}

/** Build the served URL for an override. */
export function buildOverrideUrl(extId: string, manifestPath: string): string {
  return `https://${extId}.ddx/${manifestPath}`;
}

/**
 * Public interface for the override coordinator. Used by:
 *   - ExtensionManager (install/setEnabled/kill hooks)
 *   - Protocols (boot-time apply)
 *   - src/pages/extensions/index.tsx (UI: read state, confirm/decline)
 */
export interface ExtensionUrlOverridesAPI {
  /**
   * Apply state to the Protocols layer at boot. Idempotent.
   *
   * The lookup callback resolves an extId to its current manifest
   * (or null if the extension is gone / disabled). If a previously-
   * active override points at an extension that's no longer
   * resolvable, the slot is cleared.
   */
  applyAll(
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void>;

  /**
   * Called by ExtensionManager after a successful install. If the
   * manifest declares any chrome_url_overrides and the user hasn't
   * previously declined this extension for that slot, stage as
   * pending so the UI shows a confirmation banner.
   */
  onExtensionInstalled(
    extId: string,
    manifest: ChromeManifest | FirefoxManifest,
  ): Promise<void>;

  /**
   * Called by ExtensionManager when an extension is disabled or
   * uninstalled. Clears any active or pending slot owned by this
   * extId.
   */
  onExtensionRemoved(extId: string): Promise<void>;

  /** UI: accept a pending override and apply it. */
  confirmPending(
    kind: OverrideKind,
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void>;

  /** UI: reject a pending override and remember the decline. */
  declinePending(kind: OverrideKind): Promise<void>;

  /** UI: user toggle to disable an active override. */
  clearActive(
    kind: OverrideKind,
  ): Promise<void>;

  /**
   * UI: user toggle to enable an override for a specific extension.
   * Bypasses the pending-banner flow (used when the user explicitly
   * checks the override box on the extension's card). Clears any
   * previously-active claimant for the same kind.
   *
   * The lookup callback resolves the extId to a manifest so we can
   * read the override path.
   */
  setActive(
    kind: OverrideKind,
    extId: string,
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void>;

  /** UI: read current state for rendering. */
  getState(): Promise<PersistedState>;

  /**
   * Synchronous lookup: which extension currently owns the active
   * override for `kind`? Returns null if no extension claims it.
   *
   * Used by tab creation (`browser/tabs/lifecycle.ts`) to decide
   * whether to spawn the new tab's iframe with the owning
   * extension's HeliumExtensionPlugin attached — without that
   * plugin the `<extId>.ddx` fake origin hits the browser's DNS
   * resolver and fails. Sync because it's on the hot path of every
   * tab navigation.
   *
   * `applyAll` at boot populates the in-memory cache; subsequent
   * reads are O(1).
   */
  getActiveExtId(kind: OverrideKind): string | null;

  /**
   * Register a listener for state changes. Returns a dispose function.
   * Used by the extensions page to re-render banners/toggles.
   */
  subscribe(listener: (state: PersistedState) => void): () => void;
}

/**
 * Minimal Protocols surface used by the coordinator. Avoids a hard
 * dep on the full Protocols class so this module stays test-friendly.
 */
export interface ProtocolsLike {
  setExtensionOverride(kind: OverrideKind, url: string): void;
  clearExtensionOverride(kind: OverrideKind): Promise<void>;
}

export class ExtensionUrlOverrides implements ExtensionUrlOverridesAPI {
  private readonly settings: SettingsAPI;
  private readonly protocols: ProtocolsLike;
  private cached: PersistedState | null = null;
  private listeners = new Set<(state: PersistedState) => void>();

  constructor(protocols: ProtocolsLike, settings?: SettingsAPI) {
    this.protocols = protocols;
    this.settings = settings ?? new SettingsAPI();
  }

  private async load(): Promise<PersistedState> {
    if (this.cached) return this.cached;
    const raw = await this.settings.getItem<Partial<PersistedState>>(SETTINGS_KEY);
    this.cached = {
      active: raw?.active ?? {},
      pending: raw?.pending ?? {},
      declined: raw?.declined ?? {},
    };
    return this.cached;
  }

  private async persist(state: PersistedState): Promise<void> {
    this.cached = state;
    await this.settings.setItem(SETTINGS_KEY, state);
    for (const l of this.listeners) {
      try { l(state); } catch (err) {
        console.warn('[ExtensionUrlOverrides] listener threw:', err);
      }
    }
  }

  async applyAll(
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void> {
    const state = await this.load();
    let mutated = false;
    for (const kind of OVERRIDE_KINDS) {
      const extId = state.active[kind];
      if (!extId) continue;
      const manifest = lookupManifest(extId);
      if (!manifest) {
        delete state.active[kind];
        mutated = true;
        continue;
      }
      const path = readManifestOverride(manifest, kind);
      if (!path) {
        delete state.active[kind];
        mutated = true;
        continue;
      }
      try {
        this.protocols.setExtensionOverride(kind, buildOverrideUrl(extId, path));
      } catch (err) {
        console.warn(
          `[ExtensionUrlOverrides] failed to apply ${kind} override from ${extId}:`,
          err,
        );
      }
    }
    if (mutated) await this.persist(state);
  }

  async onExtensionInstalled(
    extId: string,
    manifest: ChromeManifest | FirefoxManifest,
  ): Promise<void> {
    const state = await this.load();
    let mutated = false;
    for (const kind of OVERRIDE_KINDS) {
      const path = readManifestOverride(manifest, kind);
      if (!path) continue;
      const declined = state.declined[kind] ?? [];
      if (declined.includes(extId)) continue;
      if (state.active[kind] === extId) continue;
      state.pending[kind] = extId;
      mutated = true;
    }
    if (mutated) await this.persist(state);
  }

  async onExtensionRemoved(extId: string): Promise<void> {
    const state = await this.load();
    let mutated = false;
    for (const kind of OVERRIDE_KINDS) {
      if (state.active[kind] === extId) {
        delete state.active[kind];
        try {
          await this.protocols.clearExtensionOverride(kind);
        } catch (err) {
          console.warn(
            `[ExtensionUrlOverrides] failed to clear ${kind} on removal of ${extId}:`,
            err,
          );
        }
        mutated = true;
      }
      if (state.pending[kind] === extId) {
        delete state.pending[kind];
        mutated = true;
      }
    }
    if (mutated) await this.persist(state);
  }

  async confirmPending(
    kind: OverrideKind,
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void> {
    const state = await this.load();
    const extId = state.pending[kind];
    if (!extId) return;
    const manifest = lookupManifest(extId);
    if (!manifest) {
      delete state.pending[kind];
      await this.persist(state);
      return;
    }
    const path = readManifestOverride(manifest, kind);
    if (!path) {
      delete state.pending[kind];
      await this.persist(state);
      return;
    }
    state.active[kind] = extId;
    delete state.pending[kind];
    try {
      this.protocols.setExtensionOverride(kind, buildOverrideUrl(extId, path));
    } catch (err) {
      console.warn(
        `[ExtensionUrlOverrides] failed to set ${kind} override:`,
        err,
      );
    }
    await this.persist(state);
  }

  async declinePending(kind: OverrideKind): Promise<void> {
    const state = await this.load();
    const extId = state.pending[kind];
    if (!extId) return;
    delete state.pending[kind];
    if (!state.declined[kind]) state.declined[kind] = [];
    if (!state.declined[kind]!.includes(extId)) state.declined[kind]!.push(extId);
    await this.persist(state);
  }

  async clearActive(kind: OverrideKind): Promise<void> {
    const state = await this.load();
    if (!state.active[kind]) return;
    delete state.active[kind];
    try {
      await this.protocols.clearExtensionOverride(kind);
    } catch (err) {
      console.warn(
        `[ExtensionUrlOverrides] failed to clear ${kind}:`,
        err,
      );
    }
    await this.persist(state);
  }

  async setActive(
    kind: OverrideKind,
    extId: string,
    lookupManifest: (extId: string) => (ChromeManifest | FirefoxManifest) | null,
  ): Promise<void> {
    const manifest = lookupManifest(extId);
    if (!manifest) {
      throw new Error(`setActive: no manifest for ${extId}`);
    }
    const path = readManifestOverride(manifest, kind);
    if (!path) {
      throw new Error(`setActive: ${extId} manifest declares no ${kind} override`);
    }
    const state = await this.load();
    state.active[kind] = extId;
    if (state.pending[kind]) delete state.pending[kind];
    if (state.declined[kind]) {
      state.declined[kind] = state.declined[kind]!.filter((id) => id !== extId);
    }
    try {
      this.protocols.setExtensionOverride(kind, buildOverrideUrl(extId, path));
    } catch (err) {
      console.warn(
        `[ExtensionUrlOverrides] failed to set ${kind} override:`,
        err,
      );
    }
    await this.persist(state);
  }

  async getState(): Promise<PersistedState> {
    return await this.load();
  }

  getActiveExtId(kind: OverrideKind): string | null {
    if (!this.cached) return null;
    return this.cached.active[kind] ?? null;
  }

  subscribe(listener: (state: PersistedState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
