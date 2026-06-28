// src/core/helium/host/dnr/index.ts
//
// `compileRule` collides with the same name in `content/matcher`,
// so we re-export it under `compileDnrRule`. Internal callers within
// the DNR module use the original name directly.

export {
  type Rule as DnrRule,
  type RuleAction as DnrRuleAction,
  type RuleCondition as DnrRuleCondition,
  type CompiledRule as DnrCompiledRule,
  type DNRRequest,
  type MatchResult as DnrMatchResult,
  type HeaderInfo as DnrHeaderInfo,
  type RequestMethod as DnrRequestMethod,
  compileRule as compileDnrRule,
  compileUrlFilter as compileDnrUrlFilter,
  evalRules as evalDnrRules,
  isRegexSupported as isDnrRegexSupported,
  resolveRedirectUrl as resolveDnrRedirectUrl,
  ruleMatches as dnrRuleMatches,
} from './engine';

export { DnrStorage } from './storage';
export { DnrHandlers, type DnrHandlersFacadeDeps } from './handlers';
export {
  DnrEngineFacadeImpl,
  type ExtensionRegistryView as DnrExtensionRegistryView,
  type MatchedRuleRecord as DnrMatchedRuleRecord,
} from './facade';
export {
  parseManifestRulesets,
  type ManifestRuleset,
} from './manifest';
