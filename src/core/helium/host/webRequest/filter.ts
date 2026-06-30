
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
