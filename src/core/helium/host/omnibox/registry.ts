// src/core/helium/host/omnibox/registry.ts
//
// Per-extension omnibox keyword + default suggestion. Read from
// `manifest.omnibox.keyword` at spawn; mutated by
// chrome.omnibox.setDefaultSuggestion.

export interface DefaultSuggestion {
  description: string;
}

interface OmniboxEntry {
  extId: string;
  keyword: string;
  defaultSuggestion?: DefaultSuggestion;
}

interface ManifestOmniboxShape {
  omnibox?: { keyword?: string };
}

export class OmniboxRegistry {
  private byExtId = new Map<string, OmniboxEntry>();
  private byKeyword = new Map<string, string>(); // keyword -> extId

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
    this.byExtId.set(extId, { extId, keyword: kw });
    return kw;
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
