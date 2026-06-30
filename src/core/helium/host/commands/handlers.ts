
import type { ExtensionContext } from '../../extfs/types';

export interface CommandInfo {
  name: string;
  description?: string;
  shortcut?: string;
}

interface ManifestCommandsShape {
  commands?: Record<
    string,
    {
      description?: string;
      suggested_key?: { default?: string; mac?: string; windows?: string; chromeos?: string; linux?: string };
    }
  >;
}

export class CommandsHandlers {
  getAll = async (ctx: ExtensionContext, _args: unknown[]): Promise<CommandInfo[]> => {
    const m = ctx.manifest as ManifestCommandsShape;
    const cmds = m.commands;
    if (!cmds || typeof cmds !== 'object') return [];
    const out: CommandInfo[] = [];
    for (const [name, spec] of Object.entries(cmds)) {
      const info: CommandInfo = { name };
      if (spec?.description) info.description = spec.description;
      const sk = spec?.suggested_key;
      if (sk) {
        const platform = detectPlatform();
        const shortcut = sk[platform] ?? sk.default;
        if (shortcut) info.shortcut = shortcut;
      }
      out.push(info);
    }
    return out;
  };
}

function detectPlatform(): 'mac' | 'windows' | 'linux' | 'chromeos' | 'default' {
  if (typeof navigator === 'undefined') return 'default';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('cros')) return 'chromeos';
  if (ua.includes('linux')) return 'linux';
  return 'default';
}
