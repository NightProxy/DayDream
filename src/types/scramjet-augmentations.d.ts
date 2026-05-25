/**
 * Type augmentations for `@mercuryworkshop/scramjet`.
 *
 * The published v2.0.6-alpha typedef package re-exports `* from "./fetch"`
 * but ships no `fetch/index.d.ts`, so types defined in
 * `packages/core/src/fetch/index.ts` upstream are unreachable through the
 * package's public types entry. The runtime `scramjet-external.mjs` does
 * re-export them (as values) — only the .d.ts surface is incomplete.
 *
 * This module augments `@mercuryworkshop/scramjet` with the missing
 * exports so the vendored `scramjet-controller` source can compile.
 *
 * Source of truth:
 * https://raw.githubusercontent.com/MercuryWorkshop/scramjet/v2.0.6-alpha/packages/core/src/fetch/index.ts
 *
 * Re-sync this file when bumping the scramjet version.
 *
 * Note the leading `import` below — module augmentation in TS only works
 * inside a file that has at least one top-level import/export. Without
 * it, `declare module "..."` *replaces* the module rather than augmenting.
 */

import "@mercuryworkshop/scramjet";

declare module "@mercuryworkshop/scramjet" {
	export interface ScramjetFetchRequest {
		rawUrl: URL;
		rawReferrer: string | null;
		rawDestination: RequestDestination;
		mode: RequestMode;
		referrer: string;
		method: string;
		body: unknown;
		cache: RequestCache;
		initialHeaders: any;
		rawClientUrl?: URL;
		clientId: string;
	}

	export interface ScramjetFetchParsed {
		url: URL;
		clientUrl?: URL;
		referrerSourceUrl?: URL | null;
		hadExtraParams: boolean;
		crossSiteRedirect: boolean;
		fetchSiteState?: "same-origin" | "same-site" | "cross-site";
		fetchInitiatorOrigin?: string;
		fetchCredentialsInclude?: boolean;
		fetchMode?: string;
		isIframe?: boolean;
		destination: RequestDestination;
		meta: { origin: URL; base: URL };
		isModule: boolean;
		isFakeDataURL: boolean;
		referrerPolicy?: string;
		trackedClient?: unknown;
	}

	export interface ScramjetFetchResponse {
		body: unknown;
		headers: any;
		status: number;
		statusText: string;
	}

	export interface CookieSyncEntry {
		url: URL;
		cookie: string;
	}

	export interface CookieSyncOptions {
		clear?: boolean;
		destination?: RequestDestination;
	}

	export interface FetchHandlerInit {
		transport: any;
		context: any;
		crossOriginIsolated?: boolean;
		sendSetCookie: (
			cookies: CookieSyncEntry[],
			options?: CookieSyncOptions
		) => Promise<void>;
		fetchDataUrl(dataUrl: string): Promise<any>;
		fetchBlobUrl(blobUrl: string): Promise<any>;
	}

	export interface TrackedHistoryState {
		url: string;
		refererPolicy?: string;
	}

	export class ScramjetFetchHandler extends EventTarget {
		client: any;
		crossOriginIsolated: boolean;
		context: any;
		trackedClients: Map<string, any>;
		hooks: {
			rewriter: { html: any };
			fetch: any;
		};
		fetchDataUrl: (dataUrl: string) => Promise<Response>;
		fetchBlobUrl: (blobUrl: string) => Promise<Response>;
		sendSetCookie: (
			cookies: CookieSyncEntry[],
			options?: CookieSyncOptions
		) => Promise<void>;
		constructor(init: FetchHandlerInit);
		handleFetch(request: ScramjetFetchRequest): Promise<ScramjetFetchResponse>;
	}

	export interface FetchHooks {
		intercept: any;
		request: any;
		preresponse: any;
		response: any;
	}
}
