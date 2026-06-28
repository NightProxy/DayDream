// src/core/helium/host/devtools/inspectedWindow.ts
//
// chrome.devtools.inspectedWindow.* host handlers.
//
// Surface (per spec §24.3):
//   - inspectedWindow.tabId     — numeric inspected tab id
//   - inspectedWindow.eval()    — Runtime.evaluate via CdpMultiplexer
//   - inspectedWindow.reload()  — delegates to chrome.tabs.reload via nyx
//   - inspectedWindow.getResources()                — STUB returns []
//   - inspectedWindow.onResourceAdded                — STUB (never fires)
//   - inspectedWindow.onResourceContentCommitted     — STUB (never fires)
//
// The tabId is provided by the caller — the devtools_page iframe
// records its inspected tab at spawn time (see page.ts) and threads
// it through every method call. Since the BG iframe runs in its own
// frame and has no inherent inspected-tab association, we accept the
// tabId as an argument from the BG-side chrome.devtools binding (or
// from the host's devtoolsHandlers facade).
//
// Routing eval(): the host issues a CDP Runtime.evaluate through the
// per-tab DevToolsSession's CdpMultiplexer using its public
// `request(method, params)` helper, which routes to the top-level
// frame's chobitsu agent and resolves with the response.

import type { ExtensionContext } from '../../extfs/types';
import type { DevToolsManager } from '@apis/devtools';

interface InspectedWindowDeps {
	getDevToolsManager: () => DevToolsManager | null;
	/** Maps numeric tabId → DDX tabId. Required for tabs.reload routing. */
	numToDdxTabId: (n: number) => string | null;
	/** Calls chrome.tabs.reload on the underlying tab. */
	reloadTab: (ddxTabId: string, bypassCache: boolean) => Promise<void>;
}

interface EvalOptions {
	frameURL?: string;
	contextSecurityOrigin?: string;
	useContentScriptContext?: boolean;
}

interface ReloadOptions {
	userAgent?: string;
	injectedScript?: string;
	ignoreCache?: boolean;
}

interface ExceptionInfo {
	isError: true;
	code: string;
	description: string;
	details: unknown[];
	isException: boolean;
	value: string;
}

type EvalResult = [unknown, ExceptionInfo | undefined];

export class InspectedWindowHandlers {
	constructor(private readonly deps: InspectedWindowDeps) {}

	/**
	 * Returns the tabId associated with the calling devtools_page
	 * iframe. The caller (handlers.ts) supplies the active tabId from
	 * its devtools-page registry.
	 */
	getTabId = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<number> => {
		const tabId = args[0];
		if (typeof tabId !== 'number') {
			throw new Error('chrome.devtools.inspectedWindow.tabId: missing tabId');
		}
		return tabId;
	};

	/**
	 * Evaluate JS in the inspected page via Runtime.evaluate. Returns
	 * `[result, exceptionInfo?]` per the Chrome contract.
	 *
	 * Args layout (from handlers.ts):
	 *   [tabId, expression, options?]
	 */
	eval = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<EvalResult> => {
		const tabId = args[0] as number;
		const expression = args[1] as string;
		const options = (args[2] as EvalOptions | undefined) ?? {};

		void options.frameURL;
		void options.contextSecurityOrigin;
		// NOTE(helium-t1-3): useContentScriptContext is a documented v1
		// limitation. Honoring it would require routing the eval to a
		// per-isolated-world chobitsu agent (one per content-script
		// world), which the current single-agent-per-frame multiplexer
		// does not model. v1 always evals in the page realm; extensions
		// that rely on CS-world helpers (e.g. jQuery injected by the
		// extension) will not see them.
		void options.useContentScriptContext;

		const mgr = this.deps.getDevToolsManager();
		if (!mgr) {
			return [undefined, makeError('NO_MANAGER', 'DevToolsManager unavailable')];
		}
		const ddx = this.deps.numToDdxTabId(tabId);
		if (!ddx) {
			return [undefined, makeError('NO_TAB', `Tab ${tabId} not found`)];
		}
		const session = mgr.getSession(ddx);
		if (!session) {
			return [
				undefined,
				makeError('NO_DEVTOOLS', `DevTools not open for tab ${tabId}`),
			];
		}

		const mux = session.getMultiplexer();
		type RuntimeEvalResult = {
			result?: { value?: unknown; description?: string };
			exceptionDetails?: { text?: string; exception?: unknown };
		};
		try {
			const result = await mux.request<RuntimeEvalResult>(
				'Runtime.evaluate',
				{ expression, returnByValue: true, includeCommandLineAPI: true },
			);
			const ex = result?.exceptionDetails;
			if (ex) {
				return [
					undefined,
					makeError('EXCEPTION', ex.text ?? 'exception', ex.exception),
				];
			}
			return [result?.result?.value, undefined];
		} catch (err) {
			const message = (err as Error)?.message ?? String(err);
			const code = /timed out/.test(message) ? 'TIMEOUT' : 'CDP_ERROR';
			return [undefined, makeError(code, message)];
		}
	};

	/**
	 * Reload the inspected tab. ignoreCache → bypassCache. UA override
	 * and injectedScript are not supported.
	 *
	 * Args layout (from handlers.ts):
	 *   [tabId, options?]
	 */
	reload = async (
		_ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		const tabId = args[0] as number;
		const opts = (args[1] as ReloadOptions | undefined) ?? {};
		if (opts.userAgent) {
			console.warn(
				'[helium/devtools] inspectedWindow.reload: userAgent override ignored',
			);
		}
		if (opts.injectedScript) {
			// NOTE(helium-t1-3): documented v1 limitation. Honoring
			// injectedScript would require Page.addScriptToEvaluateOnNewDocument
			// (or an equivalent pre-navigation hook in chobitsu) wired
			// to clear after the next navigation completes. Punting:
			// the host has no analogous pre-load script slot today, and
			// the only known caller (devtools_page reload buttons that
			// inject ad-hoc helpers) tolerates the ignore.
			console.warn(
				'[helium/devtools] inspectedWindow.reload: injectedScript ignored',
			);
		}
		const ddx = this.deps.numToDdxTabId(tabId);
		if (!ddx) throw new Error(`Tab ${tabId} not found`);
		await this.deps.reloadTab(ddx, opts.ignoreCache === true);
	};

	getResources = async (
		_ctx: ExtensionContext,
		_args: unknown[],
	): Promise<unknown[]> => [];
}

function makeError(
	code: string,
	description: string,
	value?: unknown,
): ExceptionInfo {
	return {
		isError: true,
		code,
		description,
		details: [],
		isException: value !== undefined,
		value: String(value ?? description),
	};
}
