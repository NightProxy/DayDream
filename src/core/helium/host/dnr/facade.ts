// src/core/helium/host/dnr/facade.ts
//
// Adapter implementing the WebRequestPlugin's DnrEngineFacade.
// On each request, walks every running extension that has the
// `declarativeNetRequest` permission, evaluates rules, and combines
// the per-extension MatchResults per Chrome semantics:
//
//   - `block` from any extension wins over `redirect` /
//     `modifyHeaders` from others.
//   - `allow` / `allowAllRequests` from any extension overrides
//     others' `block`. (Spec §18.)
//   - `modifyHeaders` from multiple extensions concatenate.

import {
  compileRule,
  evalRules,
  type CompiledRule,
  type DNRRequest,
} from './engine';
import type { DnrStorage } from './storage';
import type { ExtensionContext } from '../../extfs/types';
import type {
  DnrEngineFacade,
  DnrEvaluationResult,
  DnrHeaderOp,
} from '../webRequest/dnr-bridge';
import type { RequestDetails } from '../webRequest/events';

interface SpawnedExt {
  ctx: ExtensionContext;
  hasDnrPermission: boolean;
}

export interface ExtensionRegistryView {
  /**
   * Iterate currently spawned extensions. Implementation lives in
   * ExtensionManager so this module stays decoupled from it.
   */
  forEachActive(cb: (ext: SpawnedExt) => void): void;
}

/**
 * Per-rule match record kept in the facade's circular buffer. Read
 * back by chrome.declarativeNetRequest.getMatchedRules() — the buffer
 * is capped to avoid unbounded growth on busy tabs.
 */
export interface MatchedRuleRecord {
  extId: string;
  rulesetId: string;
  ruleId: number;
  tabId: number;
  timeStamp: number;
}

const MATCHED_RULES_BUFFER_CAP = 1000;

/**
 * Lightweight compiler cache: rules JSON identity isn't safe across
 * updates, so we cache by (extId, generationCounter). Generation
 * bumps whenever rules change for an ext (Task 29 callers call
 * `invalidate(extId)` after update*Rules).
 */
export class DnrEngineFacadeImpl implements DnrEngineFacade {
  private readonly storage: DnrStorage;
  private readonly registry: ExtensionRegistryView;
  private readonly compiledCache: Map<string, { gen: number; rules: CompiledRule[] }> = new Map();
  private readonly generations: Map<string, number> = new Map();
  // Circular buffer of recent rule matches. Capped at
  // MATCHED_RULES_BUFFER_CAP across all extensions to keep memory
  // bounded even on busy pages. Indexed/filtered at read time.
  private readonly matchedRules: MatchedRuleRecord[] = [];

  constructor(storage: DnrStorage, registry: ExtensionRegistryView) {
    this.storage = storage;
    this.registry = registry;
  }

  invalidate(extId: string): void {
    this.generations.set(extId, (this.generations.get(extId) ?? 0) + 1);
  }

  /**
   * Snapshot of recent matches. Filtered by extId; an optional
   * `tabId` further narrows to a single tab, and `minTimeStamp`
   * drops entries older than the cutoff. Returns a fresh array; the
   * internal buffer is not exposed.
   */
  getMatchedRulesFor(
    extId: string,
    filter: { tabId?: number; minTimeStamp?: number } = {},
  ): MatchedRuleRecord[] {
    return this.matchedRules.filter((m) => {
      if (m.extId !== extId) return false;
      if (typeof filter.tabId === 'number' && m.tabId !== filter.tabId) return false;
      if (typeof filter.minTimeStamp === 'number' && m.timeStamp < filter.minTimeStamp) {
        return false;
      }
      return true;
    });
  }

  private recordMatch(
    extId: string,
    rulesetId: string,
    ruleId: number,
    tabId: number,
  ): void {
    if (this.matchedRules.length >= MATCHED_RULES_BUFFER_CAP) {
      // Drop the oldest. shift() is O(n) but the cap is small (1k) and
      // matches are not on a hot path that we measured. If this ever
      // shows up in a profile, swap to a ring-buffer with a head index.
      this.matchedRules.shift();
    }
    this.matchedRules.push({
      extId,
      rulesetId,
      ruleId,
      tabId,
      timeStamp: Date.now(),
    });
  }

  async evaluate(details: RequestDetails): Promise<DnrEvaluationResult | null> {
    const req: DNRRequest = {
      url: details.url,
      type: details.type,
      tabId: details.tabId,
    };
    if (typeof details.method === 'string') req.method = details.method;
    if (typeof details.initiator === 'string') req.initiator = details.initiator;
    if (details.responseHeaders) {
      req.responseHeaders = details.responseHeaders.map((h) => ({
        name: h.name,
        ...(typeof h.value === 'string' ? { value: h.value } : {}),
      }));
    }

    // Per-extension evaluation.
    let combinedBlock: DnrEvaluationResult | null = null;
    let combinedAllow: DnrEvaluationResult | null = null;
    let combinedRedirect: DnrEvaluationResult | null = null;
    const allReqOps: DnrHeaderOp[] = [];
    const allRespOps: DnrHeaderOp[] = [];

    this.registry.forEachActive((ext) => {
      if (!ext.hasDnrPermission) return;
      const compiled = this.getCompiledFor(ext.ctx.id);
      if (compiled.length === 0) return;
      const result = evalRules(compiled, req, { extOrigin: ext.ctx.origin });
      if (!result) return;
      // Record the matched rule(s) for getMatchedRules(). All match
      // kinds get recorded — including `allow` / `allowAllRequests`,
      // which Chrome surfaces through getMatchedRules so extensions
      // can observe which allow rules fired.
      if (result.kind === 'modifyHeaders') {
        for (const r of result.rules) {
          this.recordMatch(ext.ctx.id, r.rulesetId, r.id, req.tabId);
        }
      } else {
        this.recordMatch(ext.ctx.id, result.rule.rulesetId, result.rule.id, req.tabId);
      }
      switch (result.kind) {
        case 'allow':
        case 'allowAllRequests':
          combinedAllow = { kind: result.kind };
          break;
        case 'block':
          if (!combinedBlock) combinedBlock = { kind: 'block' };
          break;
        case 'redirect':
          if (!combinedRedirect && result.redirectUrl) {
            combinedRedirect = { kind: 'redirect', url: result.redirectUrl };
          }
          break;
        case 'upgradeScheme':
          if (!combinedRedirect) combinedRedirect = { kind: 'upgradeScheme' };
          break;
        case 'modifyHeaders':
          allReqOps.push(...result.requestHeaders);
          allRespOps.push(...result.responseHeaders);
          break;
      }
    });

    // Allow overrides block per spec §18.
    if (combinedAllow) return combinedAllow;
    if (combinedBlock) return combinedBlock;
    if (combinedRedirect) return combinedRedirect;
    if (allReqOps.length > 0 || allRespOps.length > 0) {
      const out: DnrEvaluationResult = { kind: 'modifyHeaders' };
      if (allReqOps.length > 0) out.requestHeaders = allReqOps;
      if (allRespOps.length > 0) out.responseHeaders = allRespOps;
      return out;
    }
    return null;
  }

  private getCompiledFor(extId: string): CompiledRule[] {
    const gen = this.generations.get(extId) ?? 0;
    const cached = this.compiledCache.get(extId);
    if (cached && cached.gen === gen) return cached.rules;
    // Thread each rule's source ruleset id into the CompiledRule so
    // downstream consumers (facade.recordMatch → getMatchedRules) can
    // report the real ruleset, not a synthetic label.
    const tagged = this.storage.getAllActiveRulesWithSource(extId);
    const compiled = tagged.map(({ rule, rulesetId }) =>
      compileRule(rule, rulesetId),
    );
    this.compiledCache.set(extId, { gen, rules: compiled });
    return compiled;
  }
}
