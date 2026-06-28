// src/core/helium/host/webRequest/filter.ts
//
// chrome.webRequest filter matching. A subscriber registers via
// `addListener(listener, filter, extraInfoSpec?)`; we apply the
// filter at dispatch time to skip non-matching listeners cheaply.
//
// Filter shape (per spec §17):
//   {
//     urls: string[],              // Required match patterns
//     types?: ResourceType[],
//     tabId?: number,
//     windowId?: number,
//   }
//
// Subset matching:
//   - `urls`: at least one pattern must match the request URL via
//     `matchUrlPattern` (the same matcher used for content scripts).
//   - `types`: request resource type ∈ set (if present).
//   - `tabId` / `windowId`: exact match if present; -1 means "any
//     non-tab request" (we treat undefined as "no filter").

import { matchUrlPattern } from '../../extfs/war';

export type ResourceType =
  | 'main_frame'
  | 'sub_frame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xmlhttprequest'
  | 'ping'
  | 'csp_report'
  | 'media'
  | 'websocket'
  | 'other';

export interface RequestFilter {
  urls: string[];
  types?: ResourceType[];
  tabId?: number;
  windowId?: number;
}

/**
 * Subset of RequestDetails that filters care about. Constructed once
 * per request and reused across subscriber iteration in events.ts.
 */
export interface FilterableRequest {
  url: string;
  type: ResourceType;
  tabId: number;
  windowId?: number;
}

export function matchesRequest(
  filter: RequestFilter,
  request: FilterableRequest,
): boolean {
  // `urls` is required by the chrome contract; if it's empty, the
  // listener matches every URL (Chrome behaviour). The spec calls
  // out `<all_urls>` as the default. Be permissive.
  if (filter.urls && filter.urls.length > 0) {
    let any = false;
    for (const p of filter.urls) {
      if (p === '<all_urls>' || matchUrlPattern(p, request.url)) {
        any = true;
        break;
      }
    }
    if (!any) return false;
  }

  if (filter.types && filter.types.length > 0) {
    if (!filter.types.includes(request.type)) return false;
  }

  if (typeof filter.tabId === 'number') {
    if (filter.tabId !== request.tabId) return false;
  }

  if (typeof filter.windowId === 'number') {
    if (filter.windowId !== request.windowId) return false;
  }

  return true;
}
