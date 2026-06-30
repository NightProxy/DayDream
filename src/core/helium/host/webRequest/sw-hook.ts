
import {
  compileRule,
  evalRules,
  type CompiledRule,
  type DNRRequest,
  type Rule,
} from '../dnr/engine';
import { inferResourceType } from './events';

export const SW_DNR_UPDATE_MESSAGE_TYPE = 'helium-dnr-update';

export interface SwDnrUpdateMessage {
  type: typeof SW_DNR_UPDATE_MESSAGE_TYPE;
  extId: string;
  rules: Rule[];
  extOrigin: string;
  hasDnrPermission: boolean;
}

const swCompiled: Map<
  string,
  { rules: CompiledRule[]; extOrigin: string }
> = new Map();

/**
 * Called from the SW message handler when an update arrives.
 */
export function applySwDnrUpdate(msg: SwDnrUpdateMessage): void {
  if (!msg || msg.type !== SW_DNR_UPDATE_MESSAGE_TYPE) return;
  if (!msg.hasDnrPermission) {
    swCompiled.delete(msg.extId);
    return;
  }
  const compiled = Array.isArray(msg.rules)
    ? msg.rules.map((r) => compileRule(r))
    : [];
  swCompiled.set(msg.extId, { rules: compiled, extOrigin: msg.extOrigin });
}

/**
 * Evaluate the cached DNR rules against the FetchEvent's request.
 * Returns:
 *   null  — no rule matched (caller should continue with normal flow)
 *   Response  — block / redirect; caller should respondWith this
 *
 * Note: we only handle block/redirect/upgradeScheme/allow here.
 * modifyHeaders is a no-op at the SW level because we don't proxy
 * the request; the FetchEvent has already been issued by the time
 * we see it, so applying request-header rewrites would require
 * re-fetching with the new headers (then respondWith the synthesized
 * response). Response-header rewrites would similarly require
 * intercepting and rewriting after the network fetch completes.
 * Both are workable but deferred — modifyHeaders DNR rules are
 * already applied on Scramjet-proxied traffic via plugin.ts; the
 * SW-level path only matters for the small set of requests that
 * bypass the proxy (DDX UI assets, restored endpoints, pre-controller
 * worker fetches), where header rewrites are less important.
 *
 * NOTE(helium-t1-3): documented v1 limitation. SW-level
 * modifyHeaders would require: (a) fetch-re-issue with the rewritten
 * headers and respondWith the synthesized Response, (b) carrying
 * over body / credentials / redirect / mode flags from the original
 * Request, (c) handling response-header rewrites by intercepting the
 * upstream Response stream. v1 covers block / redirect /
 * upgradeScheme / allow at the SW level (the common DNR use cases
 * for the small bypass surface — DDX UI assets, restored endpoints,
 * pre-controller worker fetches). modifyHeaders is already supported
 * for Scramjet-proxied traffic via plugin.ts where the rewriter has
 * full request context.
 */
export async function evaluateSwLevelRules(event: {
  request: Request;
}): Promise<Response | null> {
  if (swCompiled.size === 0) return null;

  const req: DNRRequest = {
    url: event.request.url,
    type: inferResourceType(
      { url: event.request.url, method: event.request.method },
      { request: { destination: event.request.destination } },
    ),
    tabId: -1,
    method: event.request.method,
  };
  const initiator = event.request.referrer || undefined;
  if (initiator) req.initiator = initiator;

  let allowResult: 'allow' | 'allowAllRequests' | null = null;
  let blockResult = false;
  let redirectUrl: string | null = null;
  for (const [, entry] of swCompiled) {
    const result = evalRules(entry.rules, req, { extOrigin: entry.extOrigin });
    if (!result) continue;
    switch (result.kind) {
      case 'allow':
      case 'allowAllRequests':
        allowResult = result.kind;
        break;
      case 'block':
        blockResult = true;
        break;
      case 'redirect':
        if (!redirectUrl && result.redirectUrl) redirectUrl = result.redirectUrl;
        break;
      case 'upgradeScheme':
        if (!redirectUrl) {
          try {
            const u = new URL(event.request.url);
            if (u.protocol === 'http:') {
              u.protocol = 'https:';
              redirectUrl = u.toString();
            }
          } catch {
            // ignore
          }
        }
        break;
      case 'modifyHeaders':
        break;
    }
  }

  if (allowResult) return null;
  if (blockResult) {
    return new Response('', {
      status: 403,
      statusText: 'Blocked by extension',
    });
  }
  if (redirectUrl) {
    return Response.redirect(redirectUrl, 302);
  }
  return null;
}

/**
 * Send a DNR rule update from the main page to the SW. If no
 * controller is registered yet, the call is dropped silently — the
 * SW won't have anything to evaluate either way.
 */
export function pushRulesToSw(msg: SwDnrUpdateMessage): void {
  const nsw = (navigator as Navigator & {
    serviceWorker?: { controller?: { postMessage: (m: unknown) => void } };
  }).serviceWorker;
  const controller = nsw?.controller;
  if (!controller) return;
  try {
    controller.postMessage(msg);
  } catch (err) {
    console.warn('[helium/webRequest] pushRulesToSw failed:', err);
  }
}

/**
 * Build a rule-update message for a given extension from the dnrStorage
 * + permission flag, without coupling SW concerns to the storage type.
 */
export function buildSwDnrUpdate(
  extId: string,
  extOrigin: string,
  rules: Rule[],
  hasDnrPermission: boolean,
): SwDnrUpdateMessage {
  return {
    type: SW_DNR_UPDATE_MESSAGE_TYPE,
    extId,
    extOrigin,
    rules,
    hasDnrPermission,
  };
}

export function _swCachedCount(): number {
  return swCompiled.size;
}

export function _resetSwCacheForTests(): void {
  swCompiled.clear();
}
