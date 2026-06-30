
import { readExtensionFile, writeExtensionFile } from '../../extfs';
import type { Rule } from './engine';

const DYNAMIC_FILE = '__helium_dnr_dynamic__.json';
const ENABLED_FILE = '__helium_dnr_enabled__.json';
const STATIC_FILE_MAX = 1_000_000;

interface DynamicFile {
  version: 1;
  rules: Rule[];
}

interface EnabledFile {
  version: 1;
  enabled: string[];
}

export class DnrStorage {
  private readonly staticByExt: Map<string, Map<string, Rule[]>> = new Map();
  private readonly dynamicByExt: Map<string, Rule[]> = new Map();
  private readonly sessionByExt: Map<string, Rule[]> = new Map();
  private readonly enabledByExt: Map<string, Set<string>> = new Map();
  private readonly manifestRulesetsByExt: Map<
    string,
    Array<{ id: string; path: string; enabled: boolean }>
  > = new Map();

  /**
   * Called at spawn time after parsing the manifest. Loads each
   * static ruleset file from extfs and the persisted enabled set.
   */
  async loadForExt(
    extId: string,
    rulesetDescriptors: Array<{ id: string; path: string; enabled: boolean }>,
  ): Promise<void> {
    this.manifestRulesetsByExt.set(extId, rulesetDescriptors);

    const map = new Map<string, Rule[]>();
    for (const desc of rulesetDescriptors) {
      const rules = await this.readStaticFile(extId, desc.path);
      map.set(desc.id, rules);
    }
    this.staticByExt.set(extId, map);

    const enabled = await this.readEnabledFile(extId);
    if (enabled) {
      this.enabledByExt.set(extId, new Set(enabled));
    } else {
      const def = new Set<string>();
      for (const d of rulesetDescriptors) {
        if (d.enabled) def.add(d.id);
      }
      this.enabledByExt.set(extId, def);
    }

    const dyn = await this.readDynamicFile(extId);
    this.dynamicByExt.set(extId, dyn);

    this.sessionByExt.set(extId, []);
  }

  clearForExt(extId: string): void {
    this.staticByExt.delete(extId);
    this.dynamicByExt.delete(extId);
    this.sessionByExt.delete(extId);
    this.enabledByExt.delete(extId);
    this.manifestRulesetsByExt.delete(extId);
  }

  getDynamicRules(extId: string): Rule[] {
    return this.dynamicByExt.get(extId) ?? [];
  }

  async updateDynamicRules(
    extId: string,
    opts: { addRules?: Rule[]; removeRuleIds?: number[] },
  ): Promise<void> {
    const cur = this.dynamicByExt.get(extId) ?? [];
    const removeSet = new Set(opts.removeRuleIds ?? []);
    const next: Rule[] = cur.filter((r) => !removeSet.has(r.id));
    if (Array.isArray(opts.addRules)) {
      for (const r of opts.addRules) {
        if (next.some((x) => x.id === r.id)) {
          throw new Error(
            `Rule with id ${r.id} already exists in dynamic ruleset`,
          );
        }
        next.push(r);
      }
    }
    this.dynamicByExt.set(extId, next);
    await this.writeDynamicFile(extId, next);
  }

  getSessionRules(extId: string): Rule[] {
    return this.sessionByExt.get(extId) ?? [];
  }

  updateSessionRules(
    extId: string,
    opts: { addRules?: Rule[]; removeRuleIds?: number[] },
  ): void {
    const cur = this.sessionByExt.get(extId) ?? [];
    const removeSet = new Set(opts.removeRuleIds ?? []);
    const next: Rule[] = cur.filter((r) => !removeSet.has(r.id));
    if (Array.isArray(opts.addRules)) {
      for (const r of opts.addRules) {
        if (next.some((x) => x.id === r.id)) {
          throw new Error(
            `Rule with id ${r.id} already exists in session ruleset`,
          );
        }
        next.push(r);
      }
    }
    this.sessionByExt.set(extId, next);
  }

  getAvailableStaticRules(extId: string, rulesetId: string): Rule[] {
    return this.staticByExt.get(extId)?.get(rulesetId) ?? [];
  }

  /**
   * Enumerate manifest static rulesets and their enabled state.
   * Returns descriptors with the current `enabled` flag.
   */
  getStaticRulesetDescriptors(
    extId: string,
  ): Array<{ id: string; path: string; enabled: boolean }> {
    const list = this.manifestRulesetsByExt.get(extId) ?? [];
    const enabledSet = this.enabledByExt.get(extId);
    return list.map((d) => ({
      id: d.id,
      path: d.path,
      enabled: enabledSet?.has(d.id) ?? false,
    }));
  }

  getEnabledRulesets(extId: string): string[] {
    return Array.from(this.enabledByExt.get(extId) ?? []);
  }

  async updateEnabledRulesets(
    extId: string,
    opts: { enableRulesetIds?: string[]; disableRulesetIds?: string[] },
  ): Promise<void> {
    const set = this.enabledByExt.get(extId) ?? new Set<string>();
    if (Array.isArray(opts.disableRulesetIds)) {
      for (const id of opts.disableRulesetIds) set.delete(id);
    }
    if (Array.isArray(opts.enableRulesetIds)) {
      for (const id of opts.enableRulesetIds) set.add(id);
    }
    this.enabledByExt.set(extId, set);
    await this.writeEnabledFile(extId, Array.from(set));
  }

  /**
   * Combined view: all rules currently in force for an extension.
   * Order: enabled-static (in manifest order) then dynamic then session.
   * The engine sorts by priority anyway, but this stable order helps
   * with debugging.
   */
  getAllActiveRules(extId: string): Rule[] {
    const out: Rule[] = [];
    const enabledSet = this.enabledByExt.get(extId);
    const staticMap = this.staticByExt.get(extId);
    if (enabledSet && staticMap) {
      const descs = this.manifestRulesetsByExt.get(extId) ?? [];
      for (const desc of descs) {
        if (!enabledSet.has(desc.id)) continue;
        const rules = staticMap.get(desc.id);
        if (rules) out.push(...rules);
      }
    }
    out.push(...(this.dynamicByExt.get(extId) ?? []));
    out.push(...(this.sessionByExt.get(extId) ?? []));
    return out;
  }

  /**
   * Like `getAllActiveRules` but each entry is tagged with the source
   * ruleset id. Used by handlers/facade so testMatchOutcome and
   * getMatchedRules can report the real ruleset rather than a synthetic
   * '_combined' label.
   */
  getAllActiveRulesWithSource(
    extId: string,
  ): Array<{ rule: Rule; rulesetId: string }> {
    const out: Array<{ rule: Rule; rulesetId: string }> = [];
    const enabledSet = this.enabledByExt.get(extId);
    const staticMap = this.staticByExt.get(extId);
    if (enabledSet && staticMap) {
      const descs = this.manifestRulesetsByExt.get(extId) ?? [];
      for (const desc of descs) {
        if (!enabledSet.has(desc.id)) continue;
        const rules = staticMap.get(desc.id);
        if (!rules) continue;
        for (const rule of rules) {
          out.push({ rule, rulesetId: desc.id });
        }
      }
    }
    for (const rule of this.dynamicByExt.get(extId) ?? []) {
      out.push({ rule, rulesetId: '_dynamic' });
    }
    for (const rule of this.sessionByExt.get(extId) ?? []) {
      out.push({ rule, rulesetId: '_session' });
    }
    return out;
  }

  private async readStaticFile(extId: string, path: string): Promise<Rule[]> {
    const bytes = await readExtensionFile(extId, path);
    if (!bytes) return [];
    if (bytes.byteLength > STATIC_FILE_MAX) {
      console.warn(
        `[helium/dnr] static ruleset ${extId}/${path} too large (${bytes.byteLength} bytes), skipping`,
      );
      return [];
    }
    try {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed as Rule[];
    } catch (err) {
      console.warn(`[helium/dnr] failed to parse static ruleset ${path}:`, err);
      return [];
    }
  }

  private async readDynamicFile(extId: string): Promise<Rule[]> {
    const bytes = await readExtensionFile(extId, DYNAMIC_FILE);
    if (!bytes) return [];
    try {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text) as DynamicFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rules)) {
        return [];
      }
      return parsed.rules;
    } catch (err) {
      console.warn(`[helium/dnr] failed to parse dynamic rules for ${extId}:`, err);
      return [];
    }
  }

  private async writeDynamicFile(extId: string, rules: Rule[]): Promise<void> {
    const payload: DynamicFile = { version: 1, rules };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await writeExtensionFile(extId, DYNAMIC_FILE, bytes);
  }

  private async readEnabledFile(extId: string): Promise<string[] | null> {
    const bytes = await readExtensionFile(extId, ENABLED_FILE);
    if (!bytes) return null;
    try {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text) as EnabledFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.enabled)) {
        return null;
      }
      return parsed.enabled;
    } catch {
      return null;
    }
  }

  private async writeEnabledFile(
    extId: string,
    enabled: string[],
  ): Promise<void> {
    const payload: EnabledFile = { version: 1, enabled };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await writeExtensionFile(extId, ENABLED_FILE, bytes);
  }
}
