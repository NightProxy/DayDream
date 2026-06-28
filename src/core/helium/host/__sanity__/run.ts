/**
 * Sanity suite for src/core/helium/host/.
 *
 * Pure-logic checks across the host-side chrome.* namespace modules.
 * Heavier behavior (e.g. real chrome.tabs event fanout, scripting
 * relay across the iframe boundary, DNR with live webRequest hook)
 * requires an integration harness and is deferred.
 *
 * Run via:  npx tsx src/core/helium/host/__sanity__/run.ts
 *
 * Coverage:
 *   - DNR urlFilter compiler (special chars, anchors)
 *   - DNR engine evalRules (priority, allow override, modifyHeaders accumulate)
 *   - DNR engine compileRule defaults + invalid regex
 *   - DNR engine ruleMatches negative cases
 *   - DNR isRegexSupported
 *   - webNavigation matchesEventFilter (every UrlFilter field)
 *   - webRequest matchesRequest (urls + types + tabId)
 *   - i18n formatMessage substitutions (placeholders + $N)
 *   - runtime buildMessageSender (BG/CS branches)
 *   - runtime dispatchOnMessage contract (sync, async, timeout, multi-listener)
 *
 * NOTE: We avoid persistence-touching paths in modules that write to
 * extfs (action handlers, alarms scheduler, bookmarks/history state).
 * These are exercised in the integration milestone once a browser-
 * realistic harness is available.
 */

// NB: import from specific source files, NOT from the host/* barrels
// or from the ../../extfs barrel — the latter transitively imports
// HeliumExtensionPlugin → ../bootstrap → dist-loader → `?raw` import
// which tsx cannot resolve outside the rolldown bundle.
import {
  compileUrlFilter,
  compileRule,
  evalRules,
  ruleMatches,
  isRegexSupported,
  type Rule,
  type DNRRequest,
  type CompiledRule,
} from '../dnr/engine';
import { matchesEventFilter } from '../webNavigation/filter';
import { matchesRequest } from '../webRequest/filter';
import { formatMessage } from '../i18n/format';
import type { MessageEntry } from '../i18n/negotiate';
import { buildMessageSender } from '../runtime/sender';
import { dispatchOnMessage, type OnMessageListener } from '../runtime/dispatch';
import type { ExtensionContext } from '../../extfs/types';
import {
  CookieAccessor,
  type CookieJarLike,
  type DDXCookie,
} from '../../../../apis/data/cookies';
import type { Proxy } from '../../../../apis/proxy';

const failures: string[] = [];

async function expect(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures.push(`${label}: ${(err as Error).message}`);
    console.error(`  FAIL ${label}: ${(err as Error).message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond: boolean, label: string): void {
  if (!cond) throw new Error(`${label}: expected truthy`);
}

function assertFalse(cond: boolean, label: string): void {
  if (cond) throw new Error(`${label}: expected falsy`);
}

function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: substring "${needle}" not found in ${JSON.stringify(haystack)}`);
  }
}

function mkRequest(over: Partial<DNRRequest> = {}): DNRRequest {
  return {
    url: 'https://example.com/x',
    type: 'xmlhttprequest',
    tabId: 1,
    ...over,
  };
}

function mkRule(over: Partial<Rule>): Rule {
  return {
    id: 1,
    priority: 1,
    condition: {},
    action: { type: 'block' },
    ...over,
  };
}

// ─── Minimal CookieJar mock ────────────────────────────────────────────
//
// We can't import the real CookieJar from scramjet/* under tsx (it uses
// the package's internal `@/shared/snapshot` path alias that doesn't
// resolve outside the scramjet build). Instead we mirror the parts of
// its contract that CookieAccessor actually depends on:
//
//   - dump() returns JSON.stringify of a Record<id, Cookie>, where id is
//     `${domain}@${path}@${name}` and Cookie has fields
//     {name, value, domain (leading-dot), hostOnly, path, secure,
//      httpOnly, sameSite, expires?: epoch-ms number}.
//   - setCookies(setCookieHeader, url) parses a Set-Cookie header,
//     normalizes the domain (adds leading dot, falls back to url.hostname),
//     defaults path/sameSite, applies Max-Age=0 → delete, and stores by id.
//
// This is intentionally minimal: no quirks-mode parsing, no __Secure-/
// __Host- prefix enforcement, no maxAge→expires conversion when maxAge>0
// (we only need maxAge<=0 → delete for removeCookie tests). If the
// accessor ever depends on those, expand the mock.
//
// Anything we test here that's parser-/normalization-specific is
// verified against the SAME logic the real CookieJar applies, derived by
// reading scramjet/packages/core/src/shared/cookie.ts.

interface MockCookie {
  name: string;
  value: string;
  domain: string;          // leading "."
  hostOnly: boolean;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expires?: number;
}

class MockCookieJar implements CookieJarLike {
  private cookies: Record<string, MockCookie> = {};

  setCookies(header: string, url: URL): void {
    // Each `header` may be a single Set-Cookie value; we parse one.
    const parts = header.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const first = parts.shift()!;
    const eq = first.indexOf('=');
    const name = eq >= 0 ? first.slice(0, eq).trim() : '';
    const value = eq >= 0 ? first.slice(eq + 1).trim() : first;
    let domain: string | undefined;
    let path: string | undefined;
    let secure = false;
    let httpOnly = false;
    let sameSite: string | undefined;
    let expires: number | undefined;
    let maxAge: number | undefined;
    for (const p of parts) {
      const ee = p.indexOf('=');
      const k = (ee >= 0 ? p.slice(0, ee) : p).toLowerCase();
      const v = ee >= 0 ? p.slice(ee + 1) : '';
      if (k === 'domain') domain = v;
      else if (k === 'path') path = v;
      else if (k === 'secure') secure = true;
      else if (k === 'httponly') httpOnly = true;
      else if (k === 'samesite') sameSite = v;
      else if (k === 'expires') {
        const t = Date.parse(v);
        if (Number.isFinite(t)) expires = t;
      } else if (k === 'max-age') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n)) maxAge = n;
      }
    }
    const hostOnly = !domain;
    let finalDomain = domain ?? url.hostname;
    if (!finalDomain.startsWith('.')) finalDomain = '.' + finalDomain;
    if (!path || !path.startsWith('/')) path = '/';
    if (!sameSite) sameSite = 'lax';

    const id = `${finalDomain}@${path}@${name}`;
    if (maxAge !== undefined && maxAge <= 0) {
      delete this.cookies[id];
      return;
    }
    if (maxAge !== undefined && maxAge > 0) {
      expires = Date.now() + maxAge * 1000;
    }
    const cookie: MockCookie = {
      name, value,
      domain: finalDomain,
      hostOnly,
      path,
      secure,
      httpOnly,
      sameSite,
    };
    if (expires !== undefined) cookie.expires = expires;
    this.cookies[id] = cookie;
  }

  dump(): string {
    return JSON.stringify(this.cookies);
  }
}

function mkAccessor(jar: CookieJarLike): CookieAccessor {
  // CookieAccessor only invokes proxy.getCookieJar(); a stub Proxy is fine.
  const stubProxy = { getCookieJar: () => jar } as unknown as Proxy;
  return new CookieAccessor(stubProxy);
}

function mkCtx(id: string): ExtensionContext {
  return {
    id,
    manifestVersion: 3,
    manifest: {
      manifest_version: 3,
      name: 'Test',
      version: '1.0',
    } as any,
    origin: `${id}.ddx`,
  };
}

async function main(): Promise<void> {
  // ───────────────────────────────────────────────────────────
  // DNR urlFilter compiler
  // ───────────────────────────────────────────────────────────
  console.log('dnr/engine.ts — compileUrlFilter');

  await expect('compileUrlFilter: domain anchor matches host suffix', () => {
    const r = compileUrlFilter('||example.com', false);
    assertTrue(r !== null, 'regex compiled');
    assertTrue(r!.test('https://example.com/foo'), 'apex matches');
    assertTrue(r!.test('https://sub.example.com/foo'), 'subdomain matches');
    assertTrue(r!.test('http://example.com/'), 'http scheme matches');
    assertFalse(r!.test('https://other.com/'), 'unrelated host does not match');
  });

  await expect('compileUrlFilter: single | anchors start', () => {
    const r = compileUrlFilter('|http://', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('http://example.com'), 'http matches');
    assertFalse(r!.test('not http://example.com'), 'must be at start');
  });

  await expect('compileUrlFilter: trailing | anchors end', () => {
    const r = compileUrlFilter('foo.js|', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://example.com/foo.js'), 'matches at end');
    assertFalse(r!.test('https://example.com/foo.js?x'), 'no trailing junk allowed');
  });

  await expect('compileUrlFilter: ^ separator matches non-alnum', () => {
    const r = compileUrlFilter('example.com^', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://example.com/path'), '/ matches');
    assertTrue(r!.test('https://example.com:8080/'), ': matches');
    assertTrue(r!.test('https://example.com'), 'end-of-string matches');
  });

  await expect('compileUrlFilter: * matches any chars', () => {
    const r = compileUrlFilter('example*ad', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('example-ad'), 'short');
    assertTrue(r!.test('example.com/banner-ad'), 'longer');
  });

  await expect('compileUrlFilter: plain substring', () => {
    const r = compileUrlFilter('tracker', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://stats.tracker.com/x'), 'substring matches');
    assertFalse(r!.test('https://example.com/'), 'no substring no match');
  });

  await expect('compileUrlFilter: special chars in pattern are escaped', () => {
    const r = compileUrlFilter('path.ext', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://example.com/path.ext'), 'matches literal dot');
    assertFalse(r!.test('https://example.com/pathXext'), '. is escaped, not a wildcard');
  });

  await expect('compileUrlFilter: case insensitive by default', () => {
    const r = compileUrlFilter('TrAcKeR', false);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://tracker.com/'), 'lowercase matches');
    assertTrue(r!.test('https://TRACKER.com/'), 'uppercase matches');
  });

  await expect('compileUrlFilter: case sensitive when requested', () => {
    const r = compileUrlFilter('Tracker', true);
    assertTrue(r !== null, 'compiled');
    assertTrue(r!.test('https://Tracker.com/'), 'exact case matches');
    assertFalse(r!.test('https://tracker.com/'), 'wrong case does not');
  });

  await expect('compileUrlFilter: empty filter returns null', () => {
    assertEq(compileUrlFilter('', false), null, 'empty');
  });

  // ───────────────────────────────────────────────────────────
  // DNR engine evalRules — action precedence
  // ───────────────────────────────────────────────────────────
  console.log('dnr/engine.ts — evalRules');

  await expect('evalRules: returns null when no rule matches', () => {
    const r = compileRule(mkRule({ condition: { urlFilter: '||other.com' } }));
    assertEq(evalRules([r], mkRequest()), null, 'no match');
  });

  await expect('evalRules: block rule blocks request', () => {
    const r = compileRule(mkRule({ condition: { urlFilter: '||example.com' } }));
    const out = evalRules([r], mkRequest());
    assertTrue(out !== null && out.kind === 'block', 'block kind');
  });

  await expect('evalRules: higher priority allow beats lower priority block', () => {
    const block = compileRule(mkRule({
      id: 1, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'block' },
    }));
    const allow = compileRule(mkRule({
      id: 2, priority: 5,
      condition: { urlFilter: '||example.com' },
      action: { type: 'allow' },
    }));
    const out = evalRules([block, allow], mkRequest());
    assertTrue(out !== null && out.kind === 'allow', 'allow wins');
  });

  await expect('evalRules: same priority — allow wins over block', () => {
    const block = compileRule(mkRule({
      id: 1, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'block' },
    }));
    const allow = compileRule(mkRule({
      id: 2, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'allow' },
    }));
    const out = evalRules([block, allow], mkRequest());
    assertTrue(out !== null && out.kind === 'allow', 'allow wins on tie');
  });

  await expect('evalRules: allowAllRequests beats everything', () => {
    const block = compileRule(mkRule({
      id: 1, priority: 99,
      condition: { urlFilter: '||example.com' },
      action: { type: 'block' },
    }));
    const allowAll = compileRule(mkRule({
      id: 2, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'allowAllRequests' },
    }));
    const out = evalRules([block, allowAll], mkRequest());
    assertTrue(out !== null && out.kind === 'allowAllRequests', 'allowAllRequests trumps');
  });

  await expect('evalRules: modifyHeaders accumulate at lower priorities', () => {
    const mod1 = compileRule({
      id: 1, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'X-A', operation: 'set', value: '1' }] },
    });
    const mod2 = compileRule({
      id: 2, priority: 1,
      condition: { urlFilter: '||example.com' },
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'X-B', operation: 'set', value: '2' }] },
    });
    const out = evalRules([mod1, mod2], mkRequest());
    assertTrue(out !== null && out.kind === 'modifyHeaders', 'modifyHeaders kind');
    if (out && out.kind === 'modifyHeaders') {
      assertEq(out.requestHeaders.length, 2, 'two header ops');
    }
  });

  await expect('evalRules: redirect at higher priority returns redirect', () => {
    const r = compileRule({
      id: 1, priority: 5,
      condition: { urlFilter: '||example.com' },
      action: { type: 'redirect', redirect: { url: 'https://safe.com/' } },
    });
    const out = evalRules([r], mkRequest());
    assertTrue(out !== null && out.kind === 'redirect', 'redirect kind');
    if (out && out.kind === 'redirect') {
      assertEq(out.redirectUrl, 'https://safe.com/', 'redirect url passed through');
    }
  });

  await expect('evalRules: upgradeScheme at high priority returns upgradeScheme', () => {
    const r = compileRule({
      id: 1, priority: 5,
      condition: { urlFilter: '||example.com' },
      action: { type: 'upgradeScheme' },
    });
    const out = evalRules([r], mkRequest({ url: 'http://example.com/' }));
    assertTrue(out !== null && out.kind === 'upgradeScheme', 'upgradeScheme kind');
  });

  // ───────────────────────────────────────────────────────────
  // DNR ruleMatches negative cases
  // ───────────────────────────────────────────────────────────
  console.log('dnr/engine.ts — ruleMatches');

  await expect('ruleMatches: resourceTypes restricts', () => {
    const r = compileRule(mkRule({
      condition: { urlFilter: '||example.com', resourceTypes: ['image'] },
    }));
    assertFalse(ruleMatches(r, mkRequest({ type: 'xmlhttprequest' })), 'xhr rejected');
    assertTrue(ruleMatches(r, mkRequest({ type: 'image' })), 'image matches');
  });

  await expect('ruleMatches: excludedResourceTypes excludes', () => {
    const r = compileRule(mkRule({
      condition: { urlFilter: '||example.com', excludedResourceTypes: ['xmlhttprequest'] },
    }));
    assertFalse(ruleMatches(r, mkRequest({ type: 'xmlhttprequest' })), 'xhr excluded');
    assertTrue(ruleMatches(r, mkRequest({ type: 'image' })), 'image still matches');
  });

  await expect('ruleMatches: tabIds set restricts', () => {
    const r = compileRule(mkRule({
      condition: { urlFilter: '||example.com', tabIds: [42] },
    }));
    assertFalse(ruleMatches(r, mkRequest({ tabId: 1 })), 'tab 1 rejected');
    assertTrue(ruleMatches(r, mkRequest({ tabId: 42 })), 'tab 42 matches');
  });

  await expect('ruleMatches: requestMethods restricts', () => {
    const r = compileRule(mkRule({
      condition: { urlFilter: '||example.com', requestMethods: ['post'] },
    }));
    assertFalse(ruleMatches(r, mkRequest({ method: 'GET' })), 'get rejected');
    assertTrue(ruleMatches(r, mkRequest({ method: 'POST' })), 'post matches (case-insensitive)');
  });

  // ───────────────────────────────────────────────────────────
  // DNR isRegexSupported
  // ───────────────────────────────────────────────────────────
  console.log('dnr/engine.ts — isRegexSupported');

  await expect('isRegexSupported: valid regex returns isSupported=true', () => {
    const r = isRegexSupported('^https?://[a-z]+/x$');
    assertEq(r.isSupported, true, 'supported');
  });

  await expect('isRegexSupported: invalid regex returns isSupported=false', () => {
    const r = isRegexSupported('([unclosed');
    assertEq(r.isSupported, false, 'unsupported');
    assertTrue(typeof r.reason === 'string', 'reason populated');
  });

  // ───────────────────────────────────────────────────────────
  // webNavigation filter
  // ───────────────────────────────────────────────────────────
  console.log('webNavigation/filter.ts — matchesEventFilter');

  await expect('matchesEventFilter: no filter matches all', () => {
    assertTrue(matchesEventFilter(undefined, 'https://example.com/'), 'undefined filter');
    assertTrue(matchesEventFilter({}, 'https://example.com/'), 'empty filter');
    assertTrue(matchesEventFilter({ url: [] }, 'https://example.com/'), 'empty url[]');
  });

  await expect('matchesEventFilter: hostContains', () => {
    const f = { url: [{ hostContains: 'example' }] };
    assertTrue(matchesEventFilter(f, 'https://test.example.com/'), 'matches subdomain');
    assertFalse(matchesEventFilter(f, 'https://other.com/'), 'no match');
  });

  await expect('matchesEventFilter: hostEquals', () => {
    const f = { url: [{ hostEquals: 'example.com' }] };
    assertTrue(matchesEventFilter(f, 'https://example.com/foo'), 'exact match');
    assertFalse(matchesEventFilter(f, 'https://www.example.com/'), 'subdomain rejected');
  });

  await expect('matchesEventFilter: hostPrefix', () => {
    const f = { url: [{ hostPrefix: 'api.' }] };
    assertTrue(matchesEventFilter(f, 'https://api.example.com/'), 'prefix match');
    assertFalse(matchesEventFilter(f, 'https://example.com/'), 'no prefix');
  });

  await expect('matchesEventFilter: hostSuffix', () => {
    const f = { url: [{ hostSuffix: '.example.com' }] };
    assertTrue(matchesEventFilter(f, 'https://api.example.com/'), 'suffix match');
    assertFalse(matchesEventFilter(f, 'https://example.com/'), 'no leading dot');
  });

  await expect('matchesEventFilter: pathContains/Equals/Prefix/Suffix', () => {
    assertTrue(matchesEventFilter({ url: [{ pathContains: '/api/' }] }, 'https://x.com/api/v1'), 'pathContains');
    assertTrue(matchesEventFilter({ url: [{ pathEquals: '/foo' }] }, 'https://x.com/foo'), 'pathEquals');
    assertTrue(matchesEventFilter({ url: [{ pathPrefix: '/api' }] }, 'https://x.com/api/v1'), 'pathPrefix');
    assertTrue(matchesEventFilter({ url: [{ pathSuffix: '.json' }] }, 'https://x.com/a/b.json'), 'pathSuffix');
    assertFalse(matchesEventFilter({ url: [{ pathEquals: '/foo' }] }, 'https://x.com/bar'), 'mismatch');
  });

  await expect('matchesEventFilter: urlMatches regex', () => {
    const f = { url: [{ urlMatches: '^https://api\\..+/v[12]/' }] };
    assertTrue(matchesEventFilter(f, 'https://api.example.com/v2/users'), 'matches');
    assertFalse(matchesEventFilter(f, 'https://www.example.com/v2/users'), 'wrong subdomain');
  });

  await expect('matchesEventFilter: schemes restriction', () => {
    const f = { url: [{ schemes: ['https'] }] };
    assertTrue(matchesEventFilter(f, 'https://x.com/'), 'https ok');
    assertFalse(matchesEventFilter(f, 'http://x.com/'), 'http rejected');
  });

  await expect('matchesEventFilter: ports', () => {
    assertTrue(matchesEventFilter({ url: [{ ports: [8080] }] }, 'https://x.com:8080/'), 'exact port');
    assertTrue(matchesEventFilter({ url: [{ ports: [[8000, 9000]] }] }, 'https://x.com:8080/'), 'port range');
    assertFalse(matchesEventFilter({ url: [{ ports: [8080] }] }, 'https://x.com:7000/'), 'wrong port');
  });

  await expect('matchesEventFilter: multiple conditions OR-ed', () => {
    const f = { url: [{ hostEquals: 'a.com' }, { hostEquals: 'b.com' }] };
    assertTrue(matchesEventFilter(f, 'https://a.com/'), 'first matches');
    assertTrue(matchesEventFilter(f, 'https://b.com/'), 'second matches');
    assertFalse(matchesEventFilter(f, 'https://c.com/'), 'neither matches');
  });

  await expect('matchesEventFilter: invalid url returns false', () => {
    assertFalse(matchesEventFilter({ url: [{ hostEquals: 'x' }] }, 'not a url'), 'invalid url rejected');
  });

  // ───────────────────────────────────────────────────────────
  // webRequest filter
  // ───────────────────────────────────────────────────────────
  console.log('webRequest/filter.ts — matchesRequest');

  const baseReq = {
    url: 'https://example.com/api',
    type: 'xmlhttprequest' as const,
    tabId: 1,
  };

  await expect('matchesRequest: <all_urls> matches everything', () => {
    assertTrue(matchesRequest({ urls: ['<all_urls>'] }, baseReq), '<all_urls>');
  });

  await expect('matchesRequest: empty urls matches everything', () => {
    assertTrue(matchesRequest({ urls: [] }, baseReq), 'no urls = no filter');
  });

  await expect('matchesRequest: url pattern match', () => {
    assertTrue(matchesRequest({ urls: ['https://example.com/*'] }, baseReq), 'pattern match');
    assertFalse(matchesRequest({ urls: ['https://other.com/*'] }, baseReq), 'no match');
  });

  await expect('matchesRequest: types restrict', () => {
    assertTrue(matchesRequest({ urls: ['<all_urls>'], types: ['xmlhttprequest'] }, baseReq), 'matching type');
    assertFalse(matchesRequest({ urls: ['<all_urls>'], types: ['image'] }, baseReq), 'wrong type');
  });

  await expect('matchesRequest: tabId exact', () => {
    assertTrue(matchesRequest({ urls: ['<all_urls>'], tabId: 1 }, baseReq), 'matching tab');
    assertFalse(matchesRequest({ urls: ['<all_urls>'], tabId: 2 }, baseReq), 'wrong tab');
  });

  await expect('matchesRequest: windowId exact', () => {
    const req = { ...baseReq, windowId: 7 };
    assertTrue(matchesRequest({ urls: ['<all_urls>'], windowId: 7 }, req), 'matching');
    assertFalse(matchesRequest({ urls: ['<all_urls>'], windowId: 8 }, req), 'mismatch');
  });

  // ───────────────────────────────────────────────────────────
  // i18n formatMessage
  // ───────────────────────────────────────────────────────────
  console.log('i18n/format.ts — formatMessage');

  await expect('formatMessage: undefined entry returns empty string', () => {
    assertEq(formatMessage(undefined, undefined), '', 'undefined');
  });

  await expect('formatMessage: plain message returns as-is', () => {
    const e: MessageEntry = { message: 'Hello world' };
    assertEq(formatMessage(e, undefined), 'Hello world', 'plain');
  });

  await expect('formatMessage: $1..$N substitutions', () => {
    const e: MessageEntry = { message: 'Hi $1, your code is $2' };
    assertEq(formatMessage(e, ['Alice', 'XYZ']), 'Hi Alice, your code is XYZ', 'two subs');
  });

  await expect('formatMessage: single substitution string is wrapped', () => {
    const e: MessageEntry = { message: 'Hello $1' };
    assertEq(formatMessage(e, 'World'), 'Hello World', 'string sub');
  });

  await expect('formatMessage: missing sub becomes empty', () => {
    const e: MessageEntry = { message: 'Hi $1, $2' };
    assertEq(formatMessage(e, ['A']), 'Hi A, ', 'missing $2');
  });

  await expect('formatMessage: named placeholder $NAME$ replaced from placeholders', () => {
    const e: MessageEntry = {
      message: 'Hi $NAME$, age $AGE$',
      placeholders: {
        NAME: { content: 'Bob' },
        AGE: { content: '42' },
      },
    };
    assertEq(formatMessage(e, undefined), 'Hi Bob, age 42', 'named placeholders');
  });

  await expect('formatMessage: named placeholder is case-insensitive in match', () => {
    const e: MessageEntry = {
      message: 'Hi $Name$',
      placeholders: { NAME: { content: 'X' } },
    };
    assertEq(formatMessage(e, undefined), 'Hi X', 'case-insensitive match');
  });

  await expect('formatMessage: placeholders and $N coexist', () => {
    const e: MessageEntry = {
      message: '$GREETING$ $1',
      placeholders: { GREETING: { content: 'Hello' } },
    };
    assertEq(formatMessage(e, ['Alice']), 'Hello Alice', 'mixed');
  });

  // ───────────────────────────────────────────────────────────
  // Alarms scheduler — NOT exercised here.
  //
  // NOTE(helium-t1-3): documented sanity-test gap. AlarmScheduler
  // imports the `../../extfs` barrel for readExtensionFile/writeExtensionFile;
  // that barrel transitively imports the HeliumExtensionPlugin which
  // pulls bootstrap/dist-loader.ts (with its `?raw` import that tsx
  // cannot resolve at sanity-test runtime). The scheduler's pure-logic
  // surface is intentionally narrow (it just wraps setTimeout +
  // extfs writes), so this gap is acceptable for sanity. Behavior
  // is exercised by the chrome.alarms integration tests once a
  // browser + bundled bootstrap is available.
  //
  // A future cleanup could refactor scheduler.ts to accept an
  // FS-shaped dependency in its constructor (DI) so it could be
  // unit-tested here with a stub backend; tracked but not blocking.
  // ───────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────
  // Runtime buildMessageSender
  // ───────────────────────────────────────────────────────────
  console.log('runtime/sender.ts — buildMessageSender');

  await expect('buildMessageSender: BG callerExtId path', () => {
    const ctx = mkCtx('a'.repeat(32));
    const sender = buildMessageSender(ctx, { callerExtId: 'b'.repeat(32) });
    assertEq(sender.id, 'b'.repeat(32), 'id set');
    assertEq(sender.tab, undefined, 'no tab on BG path');
  });

  await expect('buildMessageSender: CS sourceWindow path with lookup', () => {
    const ctx = mkCtx('a'.repeat(32));
    const fakeWindow = {} as Window;
    const fakeTab = { id: 7, url: 'https://example.com/page' };
    const sender = buildMessageSender(ctx, {
      sourceWindow: fakeWindow,
      tabInfoLookup: () => ({ tabId: 7, url: 'https://example.com/page', tab: fakeTab }),
    });
    assertTrue(sender.tab === fakeTab, 'tab attached');
    assertEq(sender.frameId, 0, 'frameId 0 (top-frame only)');
    assertEq(sender.url, 'https://example.com/page', 'url passed through');
    assertEq(sender.origin, 'https://example.com', 'origin derived');
  });

  await expect('buildMessageSender: CS lookup returning null yields empty sender', () => {
    const ctx = mkCtx('a'.repeat(32));
    const sender = buildMessageSender(ctx, {
      sourceWindow: {} as Window,
      tabInfoLookup: () => null,
    });
    assertEq(sender.tab, undefined, 'no tab');
    assertEq(sender.url, undefined, 'no url');
  });

  await expect('buildMessageSender: malformed url skips origin assignment', () => {
    const ctx = mkCtx('a'.repeat(32));
    const sender = buildMessageSender(ctx, {
      sourceWindow: {} as Window,
      tabInfoLookup: () => ({ tabId: 1, url: 'not a url', tab: {} }),
    });
    assertEq(sender.url, 'not a url', 'url stored');
    assertEq(sender.origin, undefined, 'origin not derived');
  });

  await expect('buildMessageSender: no callerExtId + no sourceWindow → empty', () => {
    const ctx = mkCtx('a'.repeat(32));
    const sender = buildMessageSender(ctx, {});
    assertEq(sender.id, undefined, 'no id');
    assertEq(sender.tab, undefined, 'no tab');
  });

  // ───────────────────────────────────────────────────────────
  // Runtime dispatchOnMessage
  // ───────────────────────────────────────────────────────────
  console.log('runtime/dispatch.ts — dispatchOnMessage');

  await expect('dispatchOnMessage: empty listeners returns handled=false', async () => {
    const r = await dispatchOnMessage([], 'msg', null);
    assertEq(r.handled, false, 'not handled');
    assertEq(r.response, undefined, 'no response');
  });

  await expect('dispatchOnMessage: sync sendResponse delivers response', async () => {
    const listener: OnMessageListener = (msg, sender, sendResponse) => {
      sendResponse({ reply: msg });
    };
    const r = await dispatchOnMessage([listener], 'hi', null);
    assertEq(r.handled, true, 'handled');
    assertEq(JSON.stringify(r.response), JSON.stringify({ reply: 'hi' }), 'response delivered');
  });

  await expect('dispatchOnMessage: async sendResponse with return-true', async () => {
    const listener: OnMessageListener = (_msg, _sender, sendResponse) => {
      setTimeout(() => sendResponse('async-ok'), 5);
      return true;
    };
    const r = await dispatchOnMessage([listener], 'hi', null, 100);
    assertEq(r.handled, true, 'handled');
    assertEq(r.response, 'async-ok', 'async response delivered');
  });

  await expect('dispatchOnMessage: return true with no sendResponse times out', async () => {
    const listener: OnMessageListener = () => true;
    const r = await dispatchOnMessage([listener], 'hi', null, 30);
    assertEq(r.handled, false, 'unhandled after timeout');
    assertEq(r.response, undefined, 'no response');
  });

  await expect('dispatchOnMessage: multiple listeners — first sync win', async () => {
    const l1: OnMessageListener = (_m, _s, sendResponse) => { sendResponse('first'); };
    const l2: OnMessageListener = (_m, _s, sendResponse) => { sendResponse('second'); };
    const r = await dispatchOnMessage([l1, l2], 'hi', null);
    assertEq(r.response, 'first', 'first listener wins');
  });

  await expect('dispatchOnMessage: listener throwing does not abort dispatch', async () => {
    const l1: OnMessageListener = () => { throw new Error('boom'); };
    const l2: OnMessageListener = (_m, _s, sendResponse) => { sendResponse('ok'); };
    // Swallow expected console.error from dispatch
    const origErr = console.error;
    console.error = () => {};
    try {
      const r = await dispatchOnMessage([l1, l2], 'hi', null);
      assertEq(r.response, 'ok', 'second listener still ran');
    } finally {
      console.error = origErr;
    }
  });

  await expect('dispatchOnMessage: no listener returns true → settles undefined immediately', async () => {
    const l1: OnMessageListener = () => undefined;
    const l2: OnMessageListener = () => undefined;
    const t0 = Date.now();
    const r = await dispatchOnMessage([l1, l2], 'hi', null, 1000);
    const dt = Date.now() - t0;
    assertEq(r.handled, false, 'no handler');
    assertTrue(dt < 50, 'settled fast (no timeout wait)');
  });

  await expect('dispatchOnMessage: late sendResponse from non-true listener ignored', async () => {
    // Per Chrome contract, sendResponse called after listener returned
    // a non-true value is a no-op. We can't observe non-delivery
    // directly here, but we can verify return-true is required for
    // async delivery.
    const listener: OnMessageListener = (_m, _s, sendResponse) => {
      setTimeout(() => sendResponse('late'), 5);
      return undefined;
    };
    const r = await dispatchOnMessage([listener], 'hi', null, 30);
    assertEq(r.handled, false, 'late response not picked up');
    assertEq(r.response, undefined, 'response empty');
  });

  // ───────────────────────────────────────────────────────────
  // DNR engine — compileRule defaults
  // ───────────────────────────────────────────────────────────
  console.log('dnr/engine.ts — compileRule');

  await expect('compileRule: default priority is 1', () => {
    const c: CompiledRule = compileRule({
      id: 1,
      condition: {},
      action: { type: 'block' },
    });
    assertEq(c.priority, 1, 'default 1');
  });

  await expect('compileRule: explicit priority kept', () => {
    const c = compileRule({
      id: 1, priority: 7,
      condition: {},
      action: { type: 'block' },
    });
    assertEq(c.priority, 7, 'kept');
  });

  await expect('compileRule: invalid regexFilter becomes customRegex=null', () => {
    const c = compileRule({
      id: 1,
      condition: { regexFilter: '([unclosed' },
      action: { type: 'block' },
    });
    assertEq(c.customRegex, null, 'invalid regex → null');
  });

  await expect('compileRule: domains alias for initiatorDomains', () => {
    const c = compileRule({
      id: 1,
      condition: { domains: ['example.com'] },
      action: { type: 'block' },
    });
    assertEq(JSON.stringify(c.initiatorDomains), JSON.stringify(['example.com']), 'alias works');
  });

  // ───────────────────────────────────────────────────────────
  // CookieAccessor (apis/data/cookies.ts)
  //
  // Uses a MockCookieJar that faithfully mirrors scramjet's CookieJar
  // contract: dump() returns JSON.stringify(Record<id, Cookie>) and
  // setCookies(header, url) parses a Set-Cookie header. We verify the
  // accessor reads, filters, writes, and removes cookies in the
  // chrome.cookies.* shape.
  // ───────────────────────────────────────────────────────────
  console.log('apis/data/cookies.ts — CookieAccessor');

  await expect('CookieAccessor.getCookies: empty jar returns []', async () => {
    const acc = mkAccessor(new MockCookieJar());
    const out = await acc.getCookies({});
    assertEq(out.length, 0, 'no cookies');
  });

  await expect('CookieAccessor.setCookie: writes through, getCookies reads back', async () => {
    const acc = mkAccessor(new MockCookieJar());
    const written = await acc.setCookie({
      url: 'https://example.com/',
      name: 'sid',
      value: 'abc123',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    assertTrue(written !== null, 'setCookie returned a cookie');
    assertEq(written!.name, 'sid', 'name preserved');
    assertEq(written!.value, 'abc123', 'value preserved');
    assertEq(written!.path, '/', 'path preserved');
    assertEq(written!.secure, true, 'secure flag carried');
    assertEq(written!.httpOnly, true, 'httpOnly flag carried');
    assertEq(written!.sameSite, 'lax', 'sameSite mapped to lax');
    assertEq(written!.hostOnly, true, 'hostOnly inferred (no Domain attr)');
    assertEq(written!.domain, 'example.com', 'hostOnly domain has no leading dot');
    assertEq(written!.session, true, 'no Expires => session cookie');
    assertEq(written!.storeId, '0', 'default storeId');

    const fetched = await acc.getCookies({});
    assertEq(fetched.length, 1, 'one cookie visible');
    assertEq(fetched[0]!.name, 'sid', 'fetched name');
  });

  await expect('CookieAccessor.getCookies: domain-cookie keeps leading dot', async () => {
    const acc = mkAccessor(new MockCookieJar());
    await acc.setCookie({
      url: 'https://example.com/',
      name: 'a', value: '1',
      domain: 'example.com',
      path: '/',
    });
    const fetched = await acc.getCookies({});
    assertEq(fetched.length, 1, 'one cookie');
    assertEq(fetched[0]!.hostOnly, false, 'domain cookie is not hostOnly');
    assertEq(fetched[0]!.domain, '.example.com', 'leading dot retained');
  });

  await expect('CookieAccessor.getCookies: expirationDate set from Expires', async () => {
    const acc = mkAccessor(new MockCookieJar());
    const future = Math.floor(Date.now() / 1000) + 3600;
    await acc.setCookie({
      url: 'https://example.com/',
      name: 'persist', value: 'v',
      path: '/',
      expirationDate: future,
    });
    const out = await acc.getCookies({ name: 'persist' });
    assertEq(out.length, 1, 'one match');
    assertEq(out[0]!.session, false, 'not session');
    assertTrue(out[0]!.expirationDate !== undefined, 'expirationDate set');
    // Allow ±2s for Date.parse() round-trip rounding (Expires uses
    // second-precision UTC strings).
    const drift = Math.abs((out[0]!.expirationDate ?? 0) - future);
    assertTrue(drift <= 2, `expirationDate within 2s of input (drift=${drift})`);
  });

  await expect('CookieAccessor.getCookies: filter by name', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    await acc.setCookie({ url: 'https://example.com/', name: 'a', value: '1', path: '/' });
    await acc.setCookie({ url: 'https://example.com/', name: 'b', value: '2', path: '/' });
    const just_a = await acc.getCookies({ name: 'a' });
    assertEq(just_a.length, 1, 'one match');
    assertEq(just_a[0]!.name, 'a', 'name a');
  });

  await expect('CookieAccessor.getCookies: filter by url (host + scheme)', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    // Host-only on example.com
    await acc.setCookie({ url: 'https://example.com/', name: 'host', value: 'h', path: '/', secure: true });
    // Domain cookie (.other.com)
    await acc.setCookie({ url: 'https://other.com/', name: 'd', value: 'd', domain: 'other.com', path: '/' });

    const matchExample = await acc.getCookies({ url: 'https://example.com/' });
    assertEq(matchExample.length, 1, 'example.com gets host cookie');
    assertEq(matchExample[0]!.name, 'host', 'host cookie');

    // Secure cookie shouldn't surface on http:
    const http = await acc.getCookies({ url: 'http://example.com/' });
    assertEq(http.length, 0, 'secure cookie blocked on http');

    const matchSubOther = await acc.getCookies({ url: 'https://api.other.com/' });
    assertEq(matchSubOther.length, 1, 'subdomain matches non-hostOnly cookie');
    assertEq(matchSubOther[0]!.name, 'd', 'domain cookie');
  });

  await expect('CookieAccessor.getCookies: filter by session', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    await acc.setCookie({ url: 'https://example.com/', name: 'sess', value: 's', path: '/' });
    await acc.setCookie({
      url: 'https://example.com/',
      name: 'pers', value: 'p',
      path: '/',
      expirationDate: Math.floor(Date.now() / 1000) + 3600,
    });
    const sessOnly = await acc.getCookies({ session: true });
    assertEq(sessOnly.length, 1, 'one session');
    assertEq(sessOnly[0]!.name, 'sess', 'session cookie');
    const persOnly = await acc.getCookies({ session: false });
    assertEq(persOnly.length, 1, 'one persistent');
    assertEq(persOnly[0]!.name, 'pers', 'persistent cookie');
  });

  await expect('CookieAccessor.getCookies: filter by domain (with/without leading dot)', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    await acc.setCookie({ url: 'https://api.example.com/', name: 'x', value: '1', domain: 'example.com', path: '/' });
    const a = await acc.getCookies({ domain: 'example.com' });
    assertEq(a.length, 1, 'plain domain matches');
    const b = await acc.getCookies({ domain: '.example.com' });
    assertEq(b.length, 1, 'leading-dot domain also matches');
    const c = await acc.getCookies({ domain: 'other.com' });
    assertEq(c.length, 0, 'unrelated domain misses');
  });

  await expect('CookieAccessor.setCookie: sameSite mapping (strict/lax/no_restriction)', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    const s = await acc.setCookie({ url: 'https://example.com/', name: 'a', value: '1', sameSite: 'strict' });
    const l = await acc.setCookie({ url: 'https://example.com/', name: 'b', value: '2', sameSite: 'lax' });
    const n = await acc.setCookie({ url: 'https://example.com/', name: 'c', value: '3', sameSite: 'no_restriction', secure: true });
    assertEq(s!.sameSite, 'strict', 'strict round-trip');
    assertEq(l!.sameSite, 'lax', 'lax round-trip');
    assertEq(n!.sameSite, 'no_restriction', 'None → no_restriction');
  });

  await expect('CookieAccessor.removeCookie: deletes via Max-Age=0', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    await acc.setCookie({ url: 'https://example.com/', name: 'kill', value: 'me', path: '/' });
    const before = await acc.getCookies({ name: 'kill' });
    assertEq(before.length, 1, 'present before');
    const r = await acc.removeCookie({ url: 'https://example.com/', name: 'kill' });
    assertTrue(r !== null, 'removeCookie returned descriptor');
    assertEq(r!.name, 'kill', 'descriptor name');
    assertEq(r!.storeId, '0', 'default storeId');
    const after = await acc.getCookies({ name: 'kill' });
    assertEq(after.length, 0, 'gone after remove');
  });

  await expect('CookieAccessor.getCookies: malformed dump degrades gracefully', async () => {
    // Jar that returns garbage rather than valid JSON. Swallow expected
    // console.warn from the accessor's defensive parse.
    const garbageJar: CookieJarLike = {
      dump: () => 'not json at all',
      setCookies: () => {},
    };
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const acc = mkAccessor(garbageJar);
      const out = await acc.getCookies({});
      assertEq(out.length, 0, 'returns [] on parse failure');
    } finally {
      console.warn = origWarn;
    }
  });

  await expect('CookieAccessor.toChromeCookie: shape contract', async () => {
    const jar = new MockCookieJar();
    const acc = mkAccessor(jar);
    await acc.setCookie({
      url: 'https://example.com/foo',
      name: 'k', value: 'v',
      domain: 'example.com',
      path: '/foo',
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      expirationDate: Math.floor(Date.now() / 1000) + 3600,
    });
    const out = await acc.getCookies({ name: 'k' });
    assertEq(out.length, 1, 'one match');
    const c: DDXCookie = out[0]!;
    // Every Chrome cookie field must be present and well-typed:
    assertEq(typeof c.name, 'string', 'name string');
    assertEq(typeof c.value, 'string', 'value string');
    assertEq(typeof c.domain, 'string', 'domain string');
    assertEq(typeof c.hostOnly, 'boolean', 'hostOnly bool');
    assertEq(typeof c.path, 'string', 'path string');
    assertEq(typeof c.secure, 'boolean', 'secure bool');
    assertEq(typeof c.httpOnly, 'boolean', 'httpOnly bool');
    assertEq(c.sameSite, 'strict', 'sameSite enum');
    assertEq(typeof c.session, 'boolean', 'session bool');
    assertEq(c.session, false, 'persistent → session=false');
    assertEq(typeof c.expirationDate, 'number', 'expirationDate number');
    assertEq(c.storeId, '0', 'storeId default');
  });

  // ───────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────
  console.log('');
  if (failures.length === 0) {
    console.log('all sanity checks passed');
    process.exit(0);
  } else {
    console.error(`${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

void main();
