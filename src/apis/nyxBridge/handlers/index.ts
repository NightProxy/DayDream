
import type { MethodName } from '../api';
import { DDXError } from '../types';
import type { TabResolver } from '../tabResolver';

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
	handleStore: HandleStoreLike | null;
	cdp: CdpHelperLike | null;
	proxy: unknown;
	tabs: unknown;
	protocols: unknown;
	settings: unknown;
}

export type Handler = (ctx: HandlerContext, args: any) => Promise<unknown>;

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
