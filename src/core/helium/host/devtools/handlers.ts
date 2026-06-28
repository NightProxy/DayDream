// src/core/helium/host/devtools/handlers.ts
//
// Aggregate chrome.devtools.* handlers. Composes PanelsHandlers,
// InspectedWindowHandlers, NetworkHandlers, and resolves the
// per-extension inspected tabId via the DevtoolsPageHost.
//
// Gating: chrome.devtools.* methods carry HANDLER_PERMISSIONS = null
// (no manifest permission), but each call MUST originate from an
// extension whose manifest declares `devtools_page` AND whose
// devtools_page iframe is currently spawned (i.e., devtools is open
// for at least one tab). We enforce both checks here.
//
// inspectedWindow.eval / .reload / .tabId: the BG-side caller does
// NOT pass a tabId; we resolve it from DevtoolsPageHost.getInspectedTabId
// keyed on ctx.id. If the extension has multiple devtools_page
// instances (one per tab), v1 picks the first — see page.ts.

import type { ExtensionContext } from '../../extfs/types';
import { InspectedWindowHandlers } from './inspectedWindow';
import { NetworkHandlers, buildHarEntry } from './network';
import { PanelsHandlers } from './panels';
import type { DevtoolsPageHost } from './page';
import type { DevToolsManager } from '@apis/devtools';

export interface DevtoolsHandlersDeps {
	getDevToolsManager: () => DevToolsManager | null;
	getProxy: () => { createFrame: (el: HTMLIFrameElement, opts: { plugins: unknown[] }) => Promise<unknown> } | null;
	pageHost: DevtoolsPageHost;
	/** Maps numeric tabId → DDX tabId. */
	numToDdxTabId: (n: number) => string | null;
	/** Calls chrome.tabs.reload on the underlying tab. */
	reloadTab: (ddxTabId: string, bypassCache: boolean) => Promise<void>;
	/** Fires chrome.devtools.panels.ExtensionPanel.onShown on a BG instance. */
	fireOnShown: (extId: string, panelId: number) => void;
	/** Fires chrome.devtools.panels.ExtensionPanel.onHidden on a BG instance. */
	fireOnHidden: (extId: string, panelId: number) => void;
	/** Fires chrome.devtools.network.onRequestFinished. */
	fireRequestFinished: (extId: string, entry: Record<string, unknown>) => void;
	/** Fires chrome.devtools.network.onNavigated. */
	fireNavigated: (extId: string, url: string) => void;
}

/**
 * Thrown when a chrome.devtools.* method is invoked by an extension
 * that doesn't have an active devtools_page iframe. The extension
 * manager's runChromeHandler treats this as a plain Error (no perm
 * mapping). Caught by callback unwrappers in the BG bootstrap.
 */
export class DevtoolsNotAvailableError extends Error {
	constructor(method: string) {
		super(
			`${method}: chrome.devtools.* is only available when the extension's devtools_page is open.`,
		);
		this.name = 'DevtoolsNotAvailableError';
	}
}

export class DevtoolsHandlers {
	readonly panels: PanelsHandlers;
	readonly inspectedWindow: InspectedWindowHandlers;
	readonly network: NetworkHandlers;

	constructor(private readonly deps: DevtoolsHandlersDeps) {
		this.panels = new PanelsHandlers({
			getDevToolsManager: deps.getDevToolsManager,
			getProxy: deps.getProxy,
			fireOnShown: deps.fireOnShown,
			fireOnHidden: deps.fireOnHidden,
		});
		this.inspectedWindow = new InspectedWindowHandlers({
			getDevToolsManager: deps.getDevToolsManager,
			numToDdxTabId: deps.numToDdxTabId,
			reloadTab: deps.reloadTab,
		});
		this.network = new NetworkHandlers();
	}

	// --- Routing wrappers ---------------------------------------------
	//
	// Each wrapper:
	//   1. Verifies the extension has an active devtools_page (gate).
	//   2. Resolves the inspected tabId from DevtoolsPageHost.
	//   3. Prepends tabId to args before delegating to the namespace.

	panelsCreate = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<number> => {
		this.requireDevtools(ctx, 'chrome.devtools.panels.create');
		return this.panels.create(ctx, args);
	};

	panelsElementsCreateSidebarPane = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<{ id: number }> => {
		this.requireDevtools(ctx, 'chrome.devtools.panels.elements.createSidebarPane');
		return this.panels.elementsCreateSidebarPane(ctx, args);
	};

	panelsSourcesCreateSidebarPane = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<{ id: number }> => {
		this.requireDevtools(ctx, 'chrome.devtools.panels.sources.createSidebarPane');
		return this.panels.sourcesCreateSidebarPane(ctx, args);
	};

	panelsSetOpenResourceHandler = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		this.requireDevtools(ctx, 'chrome.devtools.panels.setOpenResourceHandler');
		return this.panels.setOpenResourceHandler(ctx, args);
	};

	inspectedWindowGetTabId = async (
		ctx: ExtensionContext,
		_args: unknown[],
	): Promise<number> => {
		this.requireDevtools(ctx, 'chrome.devtools.inspectedWindow.tabId');
		const n = this.deps.pageHost.getInspectedTabId(ctx.id);
		if (n === null) {
			throw new DevtoolsNotAvailableError('chrome.devtools.inspectedWindow.tabId');
		}
		return n;
	};

	inspectedWindowEval = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<[unknown, unknown]> => {
		this.requireDevtools(ctx, 'chrome.devtools.inspectedWindow.eval');
		const n = this.deps.pageHost.getInspectedTabId(ctx.id);
		if (n === null) {
			throw new DevtoolsNotAvailableError('chrome.devtools.inspectedWindow.eval');
		}
		// Prepend tabId to args before delegating.
		return this.inspectedWindow.eval(ctx, [n, ...args]);
	};

	inspectedWindowReload = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<void> => {
		this.requireDevtools(ctx, 'chrome.devtools.inspectedWindow.reload');
		const n = this.deps.pageHost.getInspectedTabId(ctx.id);
		if (n === null) {
			throw new DevtoolsNotAvailableError('chrome.devtools.inspectedWindow.reload');
		}
		return this.inspectedWindow.reload(ctx, [n, ...args]);
	};

	inspectedWindowGetResources = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<unknown[]> => {
		this.requireDevtools(ctx, 'chrome.devtools.inspectedWindow.getResources');
		return this.inspectedWindow.getResources(ctx, args);
	};

	networkGetHAR = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<unknown> => {
		this.requireDevtools(ctx, 'chrome.devtools.network.getHAR');
		return this.network.getHAR(ctx, args);
	};

	// --- Event fan-out wiring (called from ExtensionManager) ---------

	/**
	 * Hook for webRequest.onCompleted → chrome.devtools.network.onRequestFinished.
	 * Only delivers to extensions whose devtools_page is open AND whose
	 * inspected tabId matches the request's tabId.
	 */
	onWebRequestCompleted(details: {
		url: string;
		method: string;
		statusCode?: number;
		statusLine?: string;
		requestHeaders?: Array<{ name: string; value?: string }>;
		responseHeaders?: Array<{ name: string; value?: string }>;
		tabId: number;
		timeStamp?: number;
		ip?: string;
		type?: string;
	}): void {
		const entry = buildHarEntry(details);
		for (const extId of this.deps.pageHost.getActiveExtIds()) {
			const inspected = this.deps.pageHost.getInspectedTabId(extId);
			if (inspected !== details.tabId) continue;
			try { this.deps.fireRequestFinished(extId, entry); } catch (err) {
				console.warn('[helium/devtools] fireRequestFinished threw:', err);
			}
		}
	}

	/**
	 * Hook for webNavigation.onCommitted → chrome.devtools.network.onNavigated.
	 * Filtered to inspected tab.
	 */
	onWebNavigationCommitted(tabId: number, url: string): void {
		for (const extId of this.deps.pageHost.getActiveExtIds()) {
			const inspected = this.deps.pageHost.getInspectedTabId(extId);
			if (inspected !== tabId) continue;
			try { this.deps.fireNavigated(extId, url); } catch (err) {
				console.warn('[helium/devtools] fireNavigated threw:', err);
			}
		}
	}

	// --- internals ---------------------------------------------------

	private requireDevtools(ctx: ExtensionContext, method: string): void {
		const m = ctx.manifest as { devtools_page?: string };
		if (!m.devtools_page) {
			throw new DevtoolsNotAvailableError(method);
		}
		const inspected = this.deps.pageHost.getInspectedTabId(ctx.id);
		if (inspected === null) {
			throw new DevtoolsNotAvailableError(method);
		}
	}
}
