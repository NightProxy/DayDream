// src/core/helium/host/cookies/handlers.ts

import type { ExtensionContext } from '../../extfs/types';
import type { CookieAccessor, CookieFilter, CookieSetOpts, DDXCookie } from '@apis/data/cookies';

export class CookiesHandlers {
  constructor(private readonly accessor: CookieAccessor) {}

  get = async (_ctx: ExtensionContext, args: unknown[]): Promise<DDXCookie | null> => {
    const opts = (args[0] ?? {}) as { url?: string; name?: string };
    if (!opts.url) return null;
    const filter: CookieFilter = { url: opts.url };
    if (opts.name !== undefined) filter.name = opts.name;
    const all = await this.accessor.getCookies(filter);
    return all[0] ?? null;
  };

  getAll = async (_ctx: ExtensionContext, args: unknown[]): Promise<DDXCookie[]> =>
    this.accessor.getCookies((args[0] as CookieFilter | undefined) ?? {});

  set = async (_ctx: ExtensionContext, args: unknown[]): Promise<DDXCookie | null> => {
    const opts = args[0] as CookieSetOpts | undefined;
    if (!opts?.url) return null;
    return this.accessor.setCookie(opts);
  };

  remove = async (
    _ctx: ExtensionContext,
    args: unknown[],
  ): Promise<{ url: string; name: string; storeId: string } | null> => {
    const opts = args[0] as { url?: string; name?: string; storeId?: string } | undefined;
    if (!opts?.url || !opts.name) return null;
    return this.accessor.removeCookie({
      url: opts.url,
      name: opts.name,
      ...(opts.storeId !== undefined ? { storeId: opts.storeId } : {}),
    });
  };

  getAllCookieStores = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<Array<{ id: string; tabIds: number[] }>> => [{ id: '0', tabIds: [] }];
}
