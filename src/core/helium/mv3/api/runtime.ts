import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent, ChromeRuntimeBase } from '../../shared';

export class ChromeRuntime extends ChromeRuntimeBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly onUserScriptMessage: ChromeEvent = new ChromeEvent();
  public readonly onUserScriptConnect: ChromeEvent = new ChromeEvent();

  // MV3-only. Chrome contract: `Promise<ExtensionContext[]>`. Extensions
  // use this to enumerate offscreen documents / side panels / popups
  // they own. Returning `[]` is the "nothing currently exists" case
  // and is what extensions handle by creating a new context. Safe to
  // no-op at the stub level — post-handshake the RPC overlay can
  // provide a real answer if/when we wire one.
  getContexts(...args: any[]): any {
    const cb = typeof args[1] === 'function' ? args[1] : null;
    if (cb) { try { cb([]); } catch { /* swallow */ } return undefined; }
    return Promise.resolve([]);
  }

  static readonly PlatformArch = {
    ARM: "arm",
    ARM64: "arm64",
    MIPS: "mips",
    MIPS64: "mips64",
    PPC64: "ppc64",
    RISCV64: "riscv64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformNaclArch = {
    ARM: "arm",
    MIPS: "mips",
    MIPS64: "mips64",
    PPC64: "ppc64",
    X86_32: "x86-32",
    X86_64: "x86-64",
  } as const;

  static readonly PlatformOs = {
    ANDROID: "android",
    CROS: "cros",
    FUCHSIA: "fuchsia",
    LINUX: "linux",
    MAC: "mac",
    OPENBSD: "openbsd",
    WIN: "win",
  } as const;
}
