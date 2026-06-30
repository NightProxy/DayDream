
import type { ExtensionContext } from '../../extfs/types';
import { writeExtensionFile } from '../../extfs';

/**
 * Subset of ExtensionManager exposed to runtime handlers. Defined here to
 * keep the host module decoupled from the full manager type.
 */
export interface RuntimeHostDeps {
  getSpawnedById: (id: string) => { ctx: ExtensionContext; iframe: HTMLIFrameElement } | undefined;
  respawn: (id: string) => Promise<void>;
  openTab: (url: string) => Promise<void>;
}

export class RuntimeHandlers {
  constructor(private readonly deps: RuntimeHostDeps) {}

  getBackgroundPage = async (ctx: ExtensionContext, _args: unknown[]): Promise<Window | null> => {
    if (ctx.manifestVersion !== 2) throw new Error('getBackgroundPage is MV2 only');
    const s = this.deps.getSpawnedById(ctx.id);
    return s?.iframe.contentWindow ?? null;
  };

  getPlatformInfo = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<{ os: string; arch: string; nacl_arch: string }> => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    let os = 'linux';
    if (ua.includes('mac')) os = 'mac';
    else if (ua.includes('win')) os = 'win';
    else if (ua.includes('android')) os = 'android';
    else if (ua.includes('cros')) os = 'cros';
    let arch = 'x86-64';
    if (ua.includes('arm')) arch = 'arm';
    else if (ua.includes('x86;') || ua.includes('i386')) arch = 'x86-32';
    return { os, arch, nacl_arch: arch };
  };

  getPackageDirectoryEntry = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => {
    throw new Error('getPackageDirectoryEntry is not supported');
  };

  requestUpdateCheck = async (
    _ctx: ExtensionContext,
    _args: unknown[],
  ): Promise<{ status: string }> => ({ status: 'no_update' });

  reload = async (ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    await this.deps.respawn(ctx.id);
  };

  setUninstallURL = async (ctx: ExtensionContext, args: unknown[]): Promise<void> => {
    const url = String(args[0] ?? '');
    const payload = { version: 1 as const, uninstallURL: url };
    try {
      await writeExtensionFile(
        ctx.id,
        '__helium_runtime__.json',
        new TextEncoder().encode(JSON.stringify(payload)),
      );
    } catch (err) {
      console.warn('[helium/runtime] setUninstallURL persist failed:', err);
    }
  };

  openOptionsPage = async (ctx: ExtensionContext, _args: unknown[]): Promise<void> => {
    const m = ctx.manifest as { options_page?: string; options_ui?: { page?: string } };
    const opts = m.options_page ?? m.options_ui?.page;
    if (!opts) throw new Error('No options page declared');
    const url = `https://${ctx.origin}/${String(opts).replace(/^\/+/, '')}`;
    await this.deps.openTab(url);
  };

  connectNative = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => {
    throw new Error('Native messaging is not supported');
  };

  sendNativeMessage = async (_ctx: ExtensionContext, _args: unknown[]): Promise<unknown> => {
    throw new Error('Native messaging is not supported');
  };
}
