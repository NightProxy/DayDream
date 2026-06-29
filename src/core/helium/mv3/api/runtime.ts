import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent, ChromeRuntimeBase } from '../../shared';

export class ChromeRuntime extends ChromeRuntimeBase {
  constructor(ctx: ExtensionContext) {
    super(ctx);
  }

  public readonly onUserScriptMessage: ChromeEvent = new ChromeEvent();
  public readonly onUserScriptConnect: ChromeEvent = new ChromeEvent();

  // MV3-only. RPC-wired to the host's `runtime.getContexts` handler.
  // Post-handshake the bootstrap's installRpcBindings overlays this
  // stub with one that calls into the host (which enumerates the
  // real spawned BG/popup/offscreen contexts for this extension).
  // Pre-handshake calls now queue (per the new channelReady gate);
  // this throw is purely defensive in case a caller reaches in
  // before the overlay runs.
  getContexts(..._args: any[]): any {
    throw new Error('chrome.runtime.getContexts is not implemented (overlay not yet installed)');
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
