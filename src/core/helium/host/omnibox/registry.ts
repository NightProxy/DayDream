// src/core/helium/host/omnibox/registry.ts
//
// Per-extension omnibox keyword + default suggestion. Read from
// `manifest.omnibox.keyword` at spawn; mutated by
// chrome.omnibox.setDefaultSuggestion.

export interface DefaultSuggestion {
  description: string;
}

/** A live suggestion (as returned by an extension's `suggest()` callback). */
export interface OmniboxSuggestion {
  content: string;
  description: string;
  deletable?: boolean;
}

interface OmniboxEntry {
  extId: string;
  keyword: string;
  defaultSuggestion?: DefaultSuggestion;
  /** Latest suggestions from `onInputChanged.suggest()`. Latest call wins. */
  suggestions: OmniboxSuggestion[];
}

interface ManifestOmniboxShape {
  omnibox?: { keyword?: string };
}

export type OmniboxRegistryChangeListener = (extId: string) => void;

export class OmniboxRegistry {
  private byExtId = new Map<string, OmniboxEntry>();
  private byKeyword = new Map<string, string>(); // keyword -> extId
  private listeners = new Set<OmniboxRegistryChangeListener>();

  /**
   * Subscribe to async-suggestion arrivals (and registry mutations
   * in general). Used by the omnibox UI to re-render its dropdown
   * the moment a `suggest()` callback's array reaches the host —
   * eliminating the polling/timeout fallback path.
   *
   * Returns an unsubscribe function. Listeners are fired
   * synchronously after the state update; throwing listeners are
   * logged and skipped.
   */
  onChange(listener: OmniboxRegistryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private fire(extId: string): void {
    for (const fn of this.listeners) {
      try { fn(extId); } catch (err) { console.warn('[helium/omnibox] listener threw:', err); }
    }
  }

  registerFromManifest(extId: string, manifest: unknown): string | null {
    const m = manifest as ManifestOmniboxShape;
    const kw = m.omnibox?.keyword;
    if (!kw || typeof kw !== 'string' || kw.length === 0) return null;
    // If keyword already registered by another extension, last wins
    // (similar to Chrome's behavior).
    const existing = this.byKeyword.get(kw);
    if (existing && existing !== extId) {
      console.warn(`[helium/omnibox] keyword "${kw}" already registered by ${existing}; ${extId} wins`);
    }
    this.byKeyword.set(kw, extId);
    this.byExtId.set(extId, { extId, keyword: kw, suggestions: [] });
    return kw;
  }

  /**
   * Receive a fresh suggestions list from the extension's BG (via
   * the `suggestions-out` event router). Replaces any previous
   * suggestions. The omnibox UI reads these via `listSuggestions`
   * when rendering its dropdown.
   *
   * `raw` is whatever the BG sent. We accept either an array of
   * SuggestionResult objects or anything else (filtered out).
   */
  applySuggestions(extId: string, raw: unknown): void {
    const entry = this.byExtId.get(extId);
    if (!entry) return;
    if (!Array.isArray(raw)) {
      entry.suggestions = [];
      this.fire(extId);
      return;
    }
    entry.suggestions = raw
      .filter((s): s is { content?: unknown; description?: unknown; deletable?: unknown } =>
        s != null && typeof s === 'object',
      )
      .map((s) => ({
        content: typeof s.content === 'string' ? s.content : '',
        description: typeof s.description === 'string' ? s.description : '',
        deletable: typeof s.deletable === 'boolean' ? s.deletable : false,
      }))
      .filter((s) => s.content.length > 0);
    this.fire(extId);
  }

  /** Read current suggestions for an extension's omnibox dropdown. */
  listSuggestions(extId: string): OmniboxSuggestion[] {
    return this.byExtId.get(extId)?.suggestions ?? [];
  }

  unregister(extId: string): void {
    const entry = this.byExtId.get(extId);
    if (!entry) return;
    if (this.byKeyword.get(entry.keyword) === extId) {
      this.byKeyword.delete(entry.keyword);
    }
    this.byExtId.delete(extId);
  }

  setDefaultSuggestion(extId: string, suggestion: DefaultSuggestion): boolean {
    const entry = this.byExtId.get(extId);
    if (!entry) return false;
    entry.defaultSuggestion = suggestion;
    return true;
  }

  /**
   * Look up the extension owning a keyword. Returns null if not registered.
   */
  findByKeyword(keyword: string): { extId: string; defaultSuggestion?: DefaultSuggestion } | null {
    const extId = this.byKeyword.get(keyword);
    if (!extId) return null;
    const entry = this.byExtId.get(extId);
    if (!entry) return null;
    const out: { extId: string; defaultSuggestion?: DefaultSuggestion } = { extId };
    if (entry.defaultSuggestion) out.defaultSuggestion = entry.defaultSuggestion;
    return out;
  }

  /**
   * Given user input, return the matching keyword entry if the input
   * begins with `<keyword> ` (keyword followed by a space).
   */
  matchPrefix(input: string): { extId: string; keyword: string; rest: string; defaultSuggestion?: DefaultSuggestion } | null {
    for (const [kw, extId] of this.byKeyword) {
      if (input === kw) {
        const entry = this.byExtId.get(extId);
        const out: { extId: string; keyword: string; rest: string; defaultSuggestion?: DefaultSuggestion } = { extId, keyword: kw, rest: '' };
        if (entry?.defaultSuggestion) out.defaultSuggestion = entry.defaultSuggestion;
        return out;
      }
      const prefix = kw + ' ';
      if (input.startsWith(prefix)) {
        const entry = this.byExtId.get(extId);
        const out: { extId: string; keyword: string; rest: string; defaultSuggestion?: DefaultSuggestion } = {
          extId,
          keyword: kw,
          rest: input.slice(prefix.length),
        };
        if (entry?.defaultSuggestion) out.defaultSuggestion = entry.defaultSuggestion;
        return out;
      }
    }
    return null;
  }

  listKeywords(): string[] {
    return Array.from(this.byKeyword.keys());
  }
}
