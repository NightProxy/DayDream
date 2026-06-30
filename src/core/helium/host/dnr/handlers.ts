
import type { ExtensionContext } from '../../extfs/types';
import {
  compileRule,
  evalRules,
  isRegexSupported as engineIsRegexSupported,
  type DNRRequest,
  type Rule,
} from './engine';
import type { DnrStorage } from './storage';
import type { ResourceType } from '../webRequest/filter';
import type { MatchedRuleRecord } from './facade';

/**
 * Optional facade query interface — supplied by ExtensionManager so
 * getMatchedRules can read the real match buffer kept by
 * DnrEngineFacadeImpl. Defined as a callback to avoid a circular
 * import between handlers.ts and facade.ts.
 */
export interface DnrHandlersFacadeDeps {
  getMatchedRulesFor: (
    extId: string,
    filter: { tabId?: number; minTimeStamp?: number },
  ) => MatchedRuleRecord[];
}

export class DnrHandlers {
  private readonly storage: DnrStorage;
  private readonly facade: DnrHandlersFacadeDeps | null;
  private readonly actionOpts: Map<
    string,
    { tabUpdate?: unknown; displayActionCountAsBadgeText?: boolean }
  > = new Map();

  constructor(storage: DnrStorage, facade: DnrHandlersFacadeDeps | null = null) {
    this.storage = storage;
    this.facade = facade;
  }

  updateDynamicRules = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const opts = (args[0] ?? {}) as {
      addRules?: Rule[];
      removeRuleIds?: number[];
    };
    await this.storage.updateDynamicRules(ctx.id, opts);
  };

  getDynamicRules = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<Rule[]> => {
    return this.storage.getDynamicRules(ctx.id);
  };

  updateSessionRules = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const opts = (args[0] ?? {}) as {
      addRules?: Rule[];
      removeRuleIds?: number[];
    };
    this.storage.updateSessionRules(ctx.id, opts);
  };

  getSessionRules = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<Rule[]> => {
    return this.storage.getSessionRules(ctx.id);
  };

  updateEnabledRulesets = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const opts = (args[0] ?? {}) as {
      enableRulesetIds?: string[];
      disableRulesetIds?: string[];
    };
    await this.storage.updateEnabledRulesets(ctx.id, opts);
  };

  getEnabledRulesets = async (
    ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<string[]> => {
    return this.storage.getEnabledRulesets(ctx.id);
  };

  getAvailableStaticRules = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<Rule[]> => {
    const opts = (args[0] ?? {}) as { rulesetId?: string };
    if (typeof opts.rulesetId !== 'string') return [];
    return this.storage.getAvailableStaticRules(ctx.id, opts.rulesetId);
  };

  /**
   * Chrome's real `chrome.declarativeNetRequest.getAvailableStaticRuleCount`.
   * Returns the number of static rules an extension can still add
   * within Chrome's per-extension budget. We don't enforce the budget
   * (Helium has no equivalent quota), so this returns the static
   * `GUARANTEED_MINIMUM_STATIC_RULES` constant (30000), which signals
   * "lots of room" to any extension checking before bulk-loading.
   */
  getAvailableStaticRuleCount = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<number> => {
    return 30000;
  };

  /**
   * `chrome.declarativeNetRequest.getDisabledRuleIds({rulesetId})` —
   * Chrome 111+. Returns the list of per-rule disable overrides for a
   * given static ruleset.
   *
   * DDX has no per-rule disable feature yet, so we always return [].
   * Extensions branch on "is this rule disabled?" and pick the "rule
   * active" path, which is the normal/expected default.
   */
  getDisabledRuleIds = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<number[]> => {
    return [];
  };

  /**
   * `chrome.declarativeNetRequest.updateStaticRules({rulesetId, disableRuleIds?, enableRuleIds?})`
   * — Chrome 111+. Per-rule enable/disable within static rulesets.
   *
   * No-op for now (matches `getDisabledRuleIds` returning []) until
   * we wire per-rule overrides into DnrStorage. Resolves successfully
   * so extensions don't crash on the await.
   */
  updateStaticRules = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<void> => {
    return;
  };

  setExtensionActionOptions = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<void> => {
    const opts = (args[0] ?? {}) as {
      tabUpdate?: unknown;
      displayActionCountAsBadgeText?: boolean;
    };
    this.actionOpts.set(ctx.id, opts);
  };

  /**
   * Returns the rule matches recorded by the facade's circular buffer
   * since the extension started observing (or since the buffer wrapped
   * — see MATCHED_RULES_BUFFER_CAP in facade.ts).
   *
   * Filter args (per Chrome's MatchedRuleFilter):
   *   - tabId         → only matches that fired for this tab
   *   - minTimeStamp  → only matches at-or-after this Date.now()
   *
   * If no facade is wired (older ExtensionManager paths), returns an
   * empty list — diagnostic only, never throws.
   */
  getMatchedRules = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<{ rulesMatchedInfo: Array<{ rule: { ruleId: number; rulesetId: string }; tabId: number; timeStamp: number }> }> => {
    if (!this.facade) return { rulesMatchedInfo: [] };
    const opts = (args[0] ?? {}) as {
      filter?: { tabId?: number; minTimeStamp?: number };
    };
    const filter = opts.filter ?? {};
    const records = this.facade.getMatchedRulesFor(ctx.id, filter);
    return {
      rulesMatchedInfo: records.map((m) => ({
        rule: { ruleId: m.ruleId, rulesetId: m.rulesetId },
        tabId: m.tabId,
        timeStamp: m.timeStamp,
      })),
    };
  };

  isRegexSupported = async (
    _ctx: ExtensionContext,
    args: unknown[],
  ): Promise<{ isSupported: boolean; reason?: string }> => {
    const opts = (args[0] ?? {}) as {
      regex?: string;
      isCaseSensitive?: boolean;
      requireCapturing?: boolean;
    };
    void opts.requireCapturing;
    if (typeof opts.regex !== 'string') {
      return { isSupported: false, reason: 'regex is required' };
    }
    return engineIsRegexSupported(opts.regex, opts.isCaseSensitive);
  };

  testMatchOutcome = async (
    ctx: ExtensionContext,
    args: unknown[],
  ): Promise<{ matchedRules: Array<{ ruleId: number; rulesetId: string }> }> => {
    const opts = (args[0] ?? {}) as {
      url?: string;
      initiator?: string;
      method?: string;
      type?: ResourceType;
      tabId?: number;
      frameId?: number;
      parentFrameId?: number;
      parentDocumentId?: string;
      documentId?: string;
      documentLifecycle?: string;
      frameType?: string;
      responseHeaders?: Array<{ name: string; value?: string }>;
    };
    if (typeof opts.url !== 'string') {
      return { matchedRules: [] };
    }
    const req: DNRRequest = {
      url: opts.url,
      type: (opts.type ?? 'xmlhttprequest') as ResourceType,
      tabId: typeof opts.tabId === 'number' ? opts.tabId : -1,
    };
    if (typeof opts.initiator === 'string') req.initiator = opts.initiator;
    if (typeof opts.method === 'string') req.method = opts.method;
    if (Array.isArray(opts.responseHeaders)) {
      req.responseHeaders = opts.responseHeaders;
    }
    const tagged = this.storage.getAllActiveRulesWithSource(ctx.id);
    const rules = tagged.map(({ rule, rulesetId }) => compileRule(rule, rulesetId));
    const result = evalRules(rules, req, { extOrigin: ctx.origin });
    if (!result) return { matchedRules: [] };
    if (result.kind === 'modifyHeaders') {
      return {
        matchedRules: result.rules.map((r) => ({
          ruleId: r.id,
          rulesetId: r.rulesetId,
        })),
      };
    }
    return {
      matchedRules: [{ ruleId: result.rule.id, rulesetId: result.rule.rulesetId }],
    };
  };
}
