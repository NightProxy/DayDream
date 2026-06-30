
import type { ExtensionContext } from '../../extfs/types';

interface CommandSpec {
  name: string;
  description?: string;
  suggested_key?: {
    default?: string;
    mac?: string;
    windows?: string;
    linux?: string;
    chromeos?: string;
  };
}

interface ManifestCommandsShape {
  commands?: Record<string, Omit<CommandSpec, 'name'>>;
}

export interface CommandRegistryLike {
  register: (cmd: {
    id: string;
    label: string;
    category: string;
    source: 'keybind' | 'protocol' | 'builtin';
    icon?: string;
    shortcut?: string;
    keywords?: string[];
    action: () => void | Promise<void>;
  }) => () => void;
}

export interface KeybindManagerLike {
  getConflicts: (
    testConfig: {
      key: string;
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
      description: string;
      category: string;
      action: string;
    },
  ) => string[];
}

export interface KeyboardManagerLike {
  addKeyboardShortcut: (
    combo: { alt?: boolean; ctrl?: boolean; shift?: boolean; key: string },
    callback: (event: KeyboardEvent) => void | Promise<void>,
  ) => (() => void) | void;
}

export interface RegisterCommandsDeps {
  commandRegistry?: CommandRegistryLike | undefined;
  keybindManager?: KeybindManagerLike | undefined;
  keyboardManager?: KeyboardManagerLike | undefined;
  fireOnCommand: (extId: string, commandName: string) => void;
}

export interface RegisteredCommandsHandle {
  dispose: () => void;
  commandNames: string[];
}

let warnedAboutLeakingKeybinds = false;

export function registerCommandsForExtension(
  extId: string,
  ctx: ExtensionContext,
  deps: RegisterCommandsDeps,
): RegisteredCommandsHandle {
  const m = ctx.manifest as ManifestCommandsShape;
  const cmds = m.commands;
  if (!cmds || typeof cmds !== 'object') {
    return { dispose: () => {}, commandNames: [] };
  }

  const disposers: Array<() => void> = [];
  const names: string[] = [];

  for (const [name, raw] of Object.entries(cmds)) {
    const spec: CommandSpec = { name, ...(raw ?? {}) };
    names.push(name);

    if (deps.commandRegistry) {
      try {
        const id = `ext-${extId}-${name}`;
        const label = spec.description ?? name;
        const shortcut = pickShortcut(spec.suggested_key);
        const palette: Parameters<CommandRegistryLike['register']>[0] = {
          id,
          label: `${label} (${extId})`,
          category: 'extensions',
          source: 'builtin',
          icon: 'puzzle',
          action: () => deps.fireOnCommand(extId, name),
        };
        if (shortcut) palette.shortcut = shortcut;
        const dispose = deps.commandRegistry.register(palette);
        disposers.push(dispose);
      } catch (err) {
        console.warn(`[helium/commands] palette register failed for ${extId}/${name}:`, err);
      }
    }

    const parsed = parseSuggestedKey(spec.suggested_key);
    if (parsed && deps.keybindManager && deps.keyboardManager) {
      try {
        const conflicts = deps.keybindManager.getConflicts({
          key: parsed.key,
          ctrl: parsed.ctrl ?? false,
          alt: parsed.alt ?? false,
          shift: parsed.shift ?? false,
          meta: parsed.meta ?? false,
          description: spec.description ?? name,
          category: 'extensions',
          action: `ext-${extId}-${name}`,
        });
        if (conflicts.length > 0) {
          console.warn(
            `[helium/commands] keybind ${formatShortcut(parsed)} for ${extId}/${name} conflicts with user keybinds ${conflicts.join(', ')}; skipping`,
          );
        } else {
          const combo: { alt?: boolean; ctrl?: boolean; shift?: boolean; key: string } = {
            key: parsed.key,
          };
          if (parsed.alt) combo.alt = true;
          if (parsed.ctrl) combo.ctrl = true;
          if (parsed.shift) combo.shift = true;
          const remove = deps.keyboardManager.addKeyboardShortcut(combo, (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();
            deps.fireOnCommand(extId, name);
          });
          if (typeof remove === 'function') {
            disposers.push(remove);
          } else if (!warnedAboutLeakingKeybinds) {
            warnedAboutLeakingKeybinds = true;
            console.warn(
              `[helium/commands] KeyboardManager.addKeyboardShortcut returned void; keybind listeners for ${extId}/${name} will leak on extension kill. Update the host KeyboardManager to return a disposer.`,
            );
          }
        }
      } catch (err) {
        console.warn(`[helium/commands] keybind register failed for ${extId}/${name}:`, err);
      }
    }
    // If `parsed` is non-null but managers aren't supplied, the palette
    // entry registered above is the user-facing path. No extra warning
    // is necessary — this is the documented fallback.
  }

  return {
    commandNames: names,
    dispose: () => {
      for (const d of disposers) {
        try { d(); } catch (err) { console.warn('[helium/commands] dispose failed:', err); }
      }
    },
  };
}

interface ParsedShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

function pickShortcut(sk: CommandSpec['suggested_key'] | undefined): string | undefined {
  if (!sk) return undefined;
  const platform = detectPlatform();
  return sk[platform] ?? sk.default;
}

function parseSuggestedKey(sk: CommandSpec['suggested_key'] | undefined): ParsedShortcut | null {
  const raw = pickShortcut(sk);
  if (!raw) return null;
  const parts = raw.split('+').map((p) => p.trim());
  const out: ParsedShortcut = { key: '' };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'mactrl') out.ctrl = true;
    else if (lower === 'alt' || lower === 'option') out.alt = true;
    else if (lower === 'shift') out.shift = true;
    else if (lower === 'command' || lower === 'meta' || lower === 'cmd') out.meta = true;
    else out.key = p;
  }
  if (!out.key) return null;
  return out;
}

function formatShortcut(p: ParsedShortcut): string {
  const parts: string[] = [];
  if (p.ctrl) parts.push('Ctrl');
  if (p.alt) parts.push('Alt');
  if (p.shift) parts.push('Shift');
  if (p.meta) parts.push('Meta');
  parts.push(p.key);
  return parts.join('+');
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
