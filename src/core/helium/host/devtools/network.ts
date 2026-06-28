// src/core/helium/host/devtools/network.ts
//
// chrome.devtools.network.* host handlers.
//
// Surface (per spec §24.4):
//   - network.getHAR()                    — STUB returns empty HAR
//   - network.onRequestFinished           — fires when webRequest.onCompleted
//                                           fires (filtered to inspected tab)
//   - network.onNavigated                 — fires when inspected tab navigates
//
// The two events are fan-out hooks: ExtensionManager registers a
// listener on its existing webRequest.onCompleted + webNavigation
// committed pipelines; this module routes those events to
// devtools_page iframes that have an active subscription via the
// chrome.devtools.network.* event surface.
//
// Filtering: each fired event carries a `tabId`. We deliver to every
// devtools_page subscriber whose `inspectedTabId` matches. The
// per-extension devtools_page registry lives in `page.ts`.

import type { ExtensionContext } from '../../extfs/types';

/**
 * Minimal HAR shape required by callers that JSON.stringify the result.
 * We don't claim full HAR 1.2 fidelity — the spec lists this as a stub.
 */
export interface HARLogStub {
	log: {
		version: '1.2';
		creator: { name: 'Helium'; version: '1.0' };
		pages: [];
		entries: [];
	};
}

export class NetworkHandlers {
	getHAR = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<HARLogStub> => ({
		log: {
			version: '1.2',
			creator: { name: 'Helium', version: '1.0' },
			pages: [],
			entries: [],
		},
	});
}

/**
 * Build a HAR-entry-shaped payload from a webRequest onCompleted
 * details object. Used by the host's network.onRequestFinished
 * fan-out path.
 */
export function buildHarEntry(details: {
	url: string;
	method: string;
	statusCode?: number;
	statusLine?: string;
	timeStamp?: number;
	requestHeaders?: Array<{ name: string; value?: string }>;
	responseHeaders?: Array<{ name: string; value?: string }>;
	ip?: string;
	type?: string;
}): Record<string, unknown> {
	// NOTE(helium-t1-3): documented v1 limitation. The webRequest
	// pipeline (host/webRequest/events.ts) doesn't track per-phase
	// timing (DNS, connect, SSL, send, wait, receive) — those would
	// need to come from Performance entries or PerformanceResourceTiming
	// on the proxied side, which is not currently plumbed. We emit
	// the HAR 1.2 sentinels: -1 for unknown phases (per HAR §4.6) and
	// 0 for send/wait/receive (so total `time` stays accurate). DevTools
	// extensions that read timings.* will see "no data" instead of
	// crashing, which matches Chrome's behaviour for cross-origin
	// requests with stripped Timing-Allow-Origin.
	return {
		startedDateTime: new Date(details.timeStamp ?? Date.now()).toISOString(),
		time: 0,
		request: {
			method: details.method,
			url: details.url,
			httpVersion: 'HTTP/1.1',
			headers: (details.requestHeaders ?? []).map((h) => ({
				name: h.name,
				value: h.value ?? '',
			})),
			queryString: [],
			cookies: [],
			headersSize: -1,
			bodySize: -1,
		},
		response: {
			status: details.statusCode ?? 0,
			statusText: (details.statusLine ?? '').replace(/^HTTP\/\S+\s+\d+\s*/, '') || '',
			httpVersion: 'HTTP/1.1',
			headers: (details.responseHeaders ?? []).map((h) => ({
				name: h.name,
				value: h.value ?? '',
			})),
			cookies: [],
			content: { size: -1, mimeType: '' },
			redirectURL: '',
			headersSize: -1,
			bodySize: -1,
			_transferSize: -1,
		},
		cache: {},
		timings: {
			blocked: -1,
			dns: -1,
			connect: -1,
			send: 0,
			wait: 0,
			receive: 0,
			ssl: -1,
		},
		serverIPAddress: details.ip ?? '',
		_resourceType: details.type ?? 'other',
	};
}
