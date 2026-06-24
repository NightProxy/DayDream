// src/apis/nyxBridge/handlers/index.ts
//
// Handler registry. Per-namespace handler files import `register` from
// here and call it for each method they implement. NyxBridge.init()
// imports `_loadAll` for its side effects, then dispatches via
// `dispatch(ctx, method, args)`.

import type { MethodName } from '../api';
import { DDXError } from '../types';
import type { TabResolver } from '../tabResolver';

// Forward-declared types — fleshed out as later phases introduce them.
// Phase 5 introduces HandleStore (DOM element handles).
// Phase 6 introduces CdpHelper (per-frame chobitsu agent transport).
export interface HandleStoreLike {
	create(tabId: number, el: Element): { __handle: string; tabId: number };
	resolve(handle: { __handle: string; tabId: number }): Element | null;
	dropByTab(tabId: number): void;
}

export interface CdpHelperLike {
	send(tabId: number, method: string, params?: object): Promise<unknown>;
}

export interface HandlerContext {
	tabResolver: TabResolver;
	handleStore: HandleStoreLike | null; // null until Phase 5
	cdp: CdpHelperLike | null; // null until Phase 6
	proxy: unknown;
	tabs: unknown;
	protocols: unknown;
	settings: unknown;
}

export type Handler = (ctx: HandlerContext, args: any) => Promise<unknown>;

// Populated by per-namespace files via the `register()` helper below.
// Typed as a partial Record so tooling doesn't pretend every MethodName
// is mapped before _loadAll.ts has been imported.
export const HANDLERS: Partial<Record<MethodName, Handler>> = {};

/**
 * Register a handler. Each handler module imports `register` and calls
 * it once per method. After all handler files are loaded (via _loadAll),
 * every MethodName should have an entry — Task 8.8 adds a runtime guard
 * test that enforces this.
 */
export function register(name: MethodName, fn: Handler): void {
	HANDLERS[name] = fn;
}

export async function dispatch(ctx: HandlerContext, method: string, args: unknown): Promise<unknown> {
	const handler = (HANDLERS as Record<string, Handler | undefined>)[method];
	if (!handler) throw new DDXError('invalid_argument', `Unknown method ${method}`);
	return handler(ctx, args);
}
