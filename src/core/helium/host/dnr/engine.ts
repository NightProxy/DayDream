
import type { ResourceType } from '../webRequest/filter';
import type { DnrHeaderOp } from '../webRequest/dnr-bridge';

export type RequestMethod =
  | 'connect'
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'other';

export interface RuleCondition {
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  requestDomains?: string[];
  excludedRequestDomains?: string[];
  domains?: string[];
  excludedDomains?: string[];
  resourceTypes?: ResourceType[];
  excludedResourceTypes?: ResourceType[];
  requestMethods?: RequestMethod[];
  excludedRequestMethods?: RequestMethod[];
  domainType?: 'firstParty' | 'thirdParty';
  tabIds?: number[];
  excludedTabIds?: number[];
  responseHeaders?: HeaderInfo[];
  excludedResponseHeaders?: HeaderInfo[];
}

export interface HeaderInfo {
  header: string;
  values?: string[];
  excludedValues?: string[];
}

export interface RuleAction {
  type:
    | 'block'
    | 'redirect'
    | 'allow'
    | 'allowAllRequests'
    | 'upgradeScheme'
    | 'modifyHeaders';
  redirect?: {
    url?: string;
    extensionPath?: string;
    transform?: {
      scheme?: string;
      host?: string;
      port?: string;
      path?: string;
      query?: string;
      queryTransform?: {
        addOrReplaceParams?: Array<{ key: string; value: string; replaceOnly?: boolean }>;
        removeParams?: string[];
      };
      fragment?: string;
      username?: string;
      password?: string;
    };
    regexSubstitution?: string;
  };
  requestHeaders?: DnrHeaderOp[];
  responseHeaders?: DnrHeaderOp[];
}

export interface Rule {
  id: number;
  priority?: number;
  condition: RuleCondition;
  action: RuleAction;
}

export interface CompiledRule {
  id: number;
  priority: number;
  action: RuleAction;
  urlRegex: RegExp | null;
  customRegex: RegExp | null;
  resourceTypes: Set<ResourceType> | null;
  excludedResourceTypes: Set<ResourceType> | null;
  methods: Set<string> | null;
  excludedMethods: Set<string> | null;
  initiatorDomains: string[] | null;
  excludedInitiatorDomains: string[] | null;
  requestDomains: string[] | null;
  excludedRequestDomains: string[] | null;
  tabIds: Set<number> | null;
  excludedTabIds: Set<number> | null;
  domainType: 'firstParty' | 'thirdParty' | null;
  responseHeaders: HeaderInfo[] | null;
  excludedResponseHeaders: HeaderInfo[] | null;
  /**
   * Identifier of the ruleset this rule was loaded from. Threaded by
   * the caller of `compileRule` so the engine and downstream consumers
   * (testMatchOutcome, getMatchedRules) can report the source.
   * Conventions:
   *   - static ruleset id from manifest    → that id (e.g. 'my-rules')
   *   - dynamic rules ruleset              → '_dynamic'
   *   - session rules ruleset              → '_session'
   *   - unknown / not threaded             → '_combined'
   */
  rulesetId: string;
  raw: Rule;
}

export interface DNRRequest {
  url: string;
  initiator?: string;
  method?: string;
  type: ResourceType;
  tabId: number;
  responseHeaders?: Array<{ name: string; value?: string }>;
}

export type MatchResult =
  | {
      kind: 'allow' | 'allowAllRequests';
      rule: CompiledRule;
    }
  | {
      kind: 'block' | 'redirect' | 'upgradeScheme';
      rule: CompiledRule;
      redirectUrl?: string;
    }
  | {
      kind: 'modifyHeaders';
      rules: CompiledRule[];
      requestHeaders: DnrHeaderOp[];
      responseHeaders: DnrHeaderOp[];
    };

const RE_ESCAPE = /[.+?$(){}[\]\\]/g;

/**
 * Translate Chrome's urlFilter pattern into a JS RegExp.
 *
 * Special chars:
 *   `||example.com`  → ^https?://([^/]+\.)?example\.com
 *   `|http://`       → ^http://
 *   `|^` (end)       → $
 *   `^` (separator)  → [^a-zA-Z0-9-_.%]|$
 *   `*`              → .*
 *
 * Other chars are escaped. If `caseSensitive` is false (default),
 * the regex gets the `i` flag.
 *
 * Returns null if the filter is empty or invalid.
 */
export function compileUrlFilter(
  filter: string,
  caseSensitive: boolean,
): RegExp | null {
  if (!filter) return null;
  let pat = '';
  let i = 0;
  const n = filter.length;

  if (filter.startsWith('||')) {
    pat += '^https?://([^/]+\\.)?';
    i = 2;
  } else if (filter.startsWith('|')) {
    pat += '^';
    i = 1;
  }

  for (; i < n; i++) {
    const ch = filter[i]!;
    if (ch === '|' && i === n - 1) {
      pat += '$';
      continue;
    }
    if (ch === '^') {
      pat += '(?:[^a-zA-Z0-9._%-]|$)';
      continue;
    }
    if (ch === '*') {
      pat += '.*';
      continue;
    }
    pat += ch.replace(RE_ESCAPE, '\\$&');
  }

  try {
    return new RegExp(pat, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

export function compileRule(rule: Rule, rulesetId: string = '_combined'): CompiledRule {
  const cond = rule.condition ?? {};
  const caseSensitive = cond.isUrlFilterCaseSensitive === true;

  let urlRegex: RegExp | null = null;
  if (cond.urlFilter) {
    urlRegex = compileUrlFilter(cond.urlFilter, caseSensitive);
  }

  let customRegex: RegExp | null = null;
  if (cond.regexFilter) {
    try {
      customRegex = new RegExp(cond.regexFilter, caseSensitive ? '' : 'i');
    } catch {
      customRegex = null;
    }
  }

  const initiatorDomains =
    cond.initiatorDomains ?? cond.domains ?? null;
  const excludedInitiatorDomains =
    cond.excludedInitiatorDomains ?? cond.excludedDomains ?? null;

  return {
    id: rule.id,
    priority: rule.priority ?? 1,
    action: rule.action,
    urlRegex,
    customRegex,
    resourceTypes: cond.resourceTypes ? new Set(cond.resourceTypes) : null,
    excludedResourceTypes: cond.excludedResourceTypes
      ? new Set(cond.excludedResourceTypes)
      : null,
    methods: cond.requestMethods
      ? new Set(cond.requestMethods.map((m) => m.toLowerCase()))
      : null,
    excludedMethods: cond.excludedRequestMethods
      ? new Set(cond.excludedRequestMethods.map((m) => m.toLowerCase()))
      : null,
    initiatorDomains: initiatorDomains ?? null,
    excludedInitiatorDomains: excludedInitiatorDomains ?? null,
    requestDomains: cond.requestDomains ?? null,
    excludedRequestDomains: cond.excludedRequestDomains ?? null,
    tabIds: cond.tabIds ? new Set(cond.tabIds) : null,
    excludedTabIds: cond.excludedTabIds ? new Set(cond.excludedTabIds) : null,
    domainType: cond.domainType ?? null,
    responseHeaders: cond.responseHeaders ?? null,
    excludedResponseHeaders: cond.excludedResponseHeaders ?? null,
    rulesetId,
    raw: rule,
  };
}

function hostMatchesSuffix(host: string, suffixes: string[]): boolean {
  for (const s of suffixes) {
    if (host === s) return true;
    if (host.endsWith('.' + s)) return true;
  }
  return false;
}

function hostnameOf(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isThirdParty(reqHost: string, initiatorHost: string): boolean {
  if (!reqHost || !initiatorHost) return false;
  if (reqHost === initiatorHost) return false;
  const a = reqHost.split('.').slice(-2).join('.');
  const b = initiatorHost.split('.').slice(-2).join('.');
  return a !== b;
}

function headersIncludes(
  headers: Array<{ name: string; value?: string }> | undefined,
  spec: HeaderInfo[],
): boolean {
  if (!headers) return false;
  for (const hi of spec) {
    const wantName = hi.header.toLowerCase();
    for (const h of headers) {
      if (h.name.toLowerCase() !== wantName) continue;
      if (!hi.values || hi.values.length === 0) return true;
      const v = h.value ?? '';
      if (hi.values.some((expected) => v.includes(expected))) return true;
    }
  }
  return false;
}

export function ruleMatches(
  rule: CompiledRule,
  req: DNRRequest,
): boolean {
  if (rule.urlRegex && !rule.urlRegex.test(req.url)) return false;
  if (rule.customRegex && !rule.customRegex.test(req.url)) return false;

  if (rule.resourceTypes && !rule.resourceTypes.has(req.type)) return false;
  if (rule.excludedResourceTypes && rule.excludedResourceTypes.has(req.type)) {
    return false;
  }

  const m = (req.method ?? 'get').toLowerCase();
  if (rule.methods && !rule.methods.has(m)) return false;
  if (rule.excludedMethods && rule.excludedMethods.has(m)) return false;

  if (rule.tabIds && !rule.tabIds.has(req.tabId)) return false;
  if (rule.excludedTabIds && rule.excludedTabIds.has(req.tabId)) return false;

  const reqHost = hostnameOf(req.url);
  if (rule.requestDomains && !hostMatchesSuffix(reqHost, rule.requestDomains)) {
    return false;
  }
  if (
    rule.excludedRequestDomains &&
    hostMatchesSuffix(reqHost, rule.excludedRequestDomains)
  ) {
    return false;
  }

  const initiatorHost = req.initiator ? hostnameOf(req.initiator) : '';
  if (
    rule.initiatorDomains &&
    rule.initiatorDomains.length > 0 &&
    !hostMatchesSuffix(initiatorHost, rule.initiatorDomains)
  ) {
    return false;
  }
  if (
    rule.excludedInitiatorDomains &&
    hostMatchesSuffix(initiatorHost, rule.excludedInitiatorDomains)
  ) {
    return false;
  }

  if (rule.domainType) {
    const tp = isThirdParty(reqHost, initiatorHost);
    if (rule.domainType === 'thirdParty' && !tp) return false;
    if (rule.domainType === 'firstParty' && tp) return false;
  }

  if (rule.responseHeaders && req.responseHeaders) {
    if (!headersIncludes(req.responseHeaders, rule.responseHeaders)) return false;
  }
  if (rule.excludedResponseHeaders && req.responseHeaders) {
    if (headersIncludes(req.responseHeaders, rule.excludedResponseHeaders)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolve a redirect URL from a rule.action.redirect object. Returns
 * null if the action does not specify a usable redirect target.
 *
 * Order of precedence:
 *   1. action.redirect.url (absolute)
 *   2. action.redirect.transform (mutate request URL)
 *   3. action.redirect.regexSubstitution (combined with regexFilter)
 *   4. action.redirect.extensionPath (caller resolves to ext origin)
 */
export function resolveRedirectUrl(
  rule: CompiledRule,
  req: DNRRequest,
  opts: { extOrigin?: string } = {},
): string | null {
  const r = rule.action.redirect;
  if (!r) return null;
  if (r.url) return r.url;
  if (r.transform) {
    try {
      const u = new URL(req.url);
      const t = r.transform;
      if (t.scheme) u.protocol = t.scheme + ':';
      if (t.host) u.host = t.host;
      if (t.port) u.port = t.port;
      if (t.path) u.pathname = t.path.startsWith('/') ? t.path : '/' + t.path;
      if (t.query) u.search = t.query.startsWith('?') ? t.query : '?' + t.query;
      if (t.fragment) {
        u.hash = t.fragment.startsWith('#') ? t.fragment : '#' + t.fragment;
      }
      if (t.username) u.username = t.username;
      if (t.password) u.password = t.password;
      if (t.queryTransform) {
        const qt = t.queryTransform;
        if (Array.isArray(qt.removeParams)) {
          for (const key of qt.removeParams) u.searchParams.delete(key);
        }
        if (Array.isArray(qt.addOrReplaceParams)) {
          for (const p of qt.addOrReplaceParams) {
            if (p.replaceOnly && !u.searchParams.has(p.key)) continue;
            u.searchParams.set(p.key, p.value);
          }
        }
      }
      return u.toString();
    } catch {
      return null;
    }
  }
  if (r.regexSubstitution && rule.customRegex) {
    try {
      return req.url.replace(rule.customRegex, r.regexSubstitution);
    } catch {
      return null;
    }
  }
  if (r.extensionPath && opts.extOrigin) {
    const path = r.extensionPath.startsWith('/')
      ? r.extensionPath
      : '/' + r.extensionPath;
    return `https://${opts.extOrigin}${path}`;
  }
  return null;
}

/**
 * Evaluate a set of compiled rules against a request. Returns a
 * MatchResult or null if no rule matched.
 *
 * Action precedence (per Chrome docs):
 *   1. `allowAllRequests` from a sub_frame/main_frame rule short-
 *      circuits everything below.
 *   2. `allow` from highest matching priority.
 *   3. `block` / `redirect` / `upgradeScheme` from highest priority
 *      (first matching wins on ties).
 *   4. All matching `modifyHeaders` rules collected (with `remove`
 *      operations dropped if a higher-priority rule already
 *      modified the same header — per Chrome semantics).
 */
export function evalRules(
  rules: CompiledRule[],
  req: DNRRequest,
  opts: { extOrigin?: string } = {},
): MatchResult | null {
  const matched: CompiledRule[] = [];
  for (const r of rules) {
    if (ruleMatches(r, req)) matched.push(r);
  }
  if (matched.length === 0) return null;
  matched.sort((a, b) => b.priority - a.priority);

  for (const r of matched) {
    if (r.action.type === 'allowAllRequests') {
      return { kind: 'allowAllRequests', rule: r };
    }
  }
  const topPriority = matched[0]!.priority;
  for (const r of matched) {
    if (r.priority !== topPriority) break;
    if (r.action.type === 'allow') {
      return { kind: 'allow', rule: r };
    }
  }
  for (const r of matched) {
    if (r.priority !== topPriority) break;
    if (r.action.type === 'block') return { kind: 'block', rule: r };
    if (r.action.type === 'upgradeScheme') {
      return { kind: 'upgradeScheme', rule: r };
    }
    if (r.action.type === 'redirect') {
      const url = resolveRedirectUrl(r, req, opts);
      const out: MatchResult = {
        kind: 'redirect',
        rule: r,
      };
      if (url) out.redirectUrl = url;
      return out;
    }
  }
  const reqOps: DnrHeaderOp[] = [];
  const respOps: DnrHeaderOp[] = [];
  const modRules: CompiledRule[] = [];
  for (const r of matched) {
    if (r.action.type !== 'modifyHeaders') continue;
    modRules.push(r);
    if (Array.isArray(r.action.requestHeaders)) {
      reqOps.push(...r.action.requestHeaders);
    }
    if (Array.isArray(r.action.responseHeaders)) {
      respOps.push(...r.action.responseHeaders);
    }
  }
  if (modRules.length === 0) return null;
  return {
    kind: 'modifyHeaders',
    rules: modRules,
    requestHeaders: reqOps,
    responseHeaders: respOps,
  };
}

/**
 * `isRegexSupported` helper for chrome.declarativeNetRequest.isRegexSupported.
 */
export function isRegexSupported(
  regex: string,
  isCaseSensitive?: boolean,
): { isSupported: boolean; reason?: string } {
  try {
    new RegExp(regex, isCaseSensitive === false ? 'i' : '');
    return { isSupported: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isSupported: false, reason: msg };
  }
}
