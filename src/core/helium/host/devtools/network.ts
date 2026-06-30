
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
