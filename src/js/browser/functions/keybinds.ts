export interface KeybindConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  category: string;
  action: string;
}

export interface KeybindCategory {
  name: string;
  label: string;
  icon?: string;
}

export const KEYBIND_CATEGORIES: KeybindCategory[] = [
  { name: "tabs", label: "Tab Management", icon: "layout-grid" },
  { name: "navigation", label: "Navigation", icon: "compass" },
  { name: "devtools", label: "Developer Tools", icon: "code" },
  { name: "view", label: "View & Zoom", icon: "eye" },
  { name: "window", label: "Window Management", icon: "layout" },
  { name: "search", label: "Search & Find", icon: "search" },
];

export const DEFAULT_KEYBINDS: Record<string, KeybindConfig> = {
  newTab: {
    key: "t",
    alt: true,
    description: "Open new tab",
    category: "tabs",
    action: "newTab",
  },
  closeTab: {
    key: "w",
    alt: true,
    description: "Close current tab",
    category: "tabs",
    action: "closeTab",
  },
  reopenTab: {
    key: "t",
    alt: true,
    shift: true,
    description: "Reopen closed tab",
    category: "tabs",
    action: "reopenTab",
  },
  duplicateTab: {
    key: "d",
    alt: true,
    description: "Duplicate current tab",
    category: "tabs",
    action: "duplicateTab",
  },
  nextTab: {
    key: "Tab",
    alt: true,
    description: "Switch to next tab",
    category: "tabs",
    action: "nextTab",
  },
  prevTab: {
    key: "Tab",
    alt: true,
    shift: true,
    description: "Switch to previous tab",
    category: "tabs",
    action: "prevTab",
  },
  pinTab: {
    key: "p",
    alt: true,
    description: "Pin/unpin current tab",
    category: "tabs",
    action: "pinTab",
  },
  goBack: {
    key: "ArrowLeft",
    alt: true,
    description: "Go back in history",
    category: "navigation",
    action: "goBack",
  },
  goForward: {
    key: "ArrowRight",
    alt: true,
    description: "Go forward in history",
    category: "navigation",
    action: "goForward",
  },
  reload: {
    key: "r",
    alt: true,
    description: "Reload page",
    category: "navigation",
    action: "reload",
  },
  reloadAlt: {
    key: "F5",
    description: "Reload page (F5)",
    category: "navigation",
    action: "reload",
  },
  hardReload: {
    key: "r",
    alt: true,
    shift: true,
    description: "Hard reload (bypass cache)",
    category: "navigation",
    action: "hardReload",
  },
  focusAddressBar: {
    key: "l",
    alt: true,
    description: "Focus address bar",
    category: "navigation",
    action: "focusAddressBar",
  },
  goHome: {
    key: "h",
    alt: true,
    description: "Go to home page",
    category: "navigation",
    action: "goHome",
  },
  inspect: {
    key: "F12",
    description: "Toggle DevTools",
    category: "devtools",
    action: "inspect",
  },
  inspectAlt: {
    key: "i",
    alt: true,
    shift: true,
    description: "Toggle DevTools (Alt+Shift+I)",
    category: "devtools",
    action: "inspect",
  },
  viewSource: {
    key: "u",
    alt: true,
    description: "View page source",
    category: "devtools",
    action: "viewSource",
  },
  zoomIn: {
    key: "=",
    alt: true,
    description: "Zoom in",
    category: "view",
    action: "zoomIn",
  },
  zoomOut: {
    key: "-",
    alt: true,
    description: "Zoom out",
    category: "view",
    action: "zoomOut",
  },
  zoomReset: {
    key: "0",
    alt: true,
    description: "Reset zoom",
    category: "view",
    action: "zoomReset",
  },
  fullscreen: {
    key: "F11",
    description: "Toggle fullscreen",
    category: "view",
    action: "fullscreen",
  },
  find: {
    key: "f",
    alt: true,
    description: "Find in page",
    category: "search",
    action: "find",
  },
  findNext: {
    key: "g",
    alt: true,
    description: "Find next",
    category: "search",
    action: "findNext",
  },
  findPrev: {
    key: "g",
    alt: true,
    shift: true,
    description: "Find previous",
    category: "search",
    action: "findPrev",
  },
  openSettings: {
    key: ",",
    alt: true,
    description: "Open settings",
    category: "window",
    action: "openSettings",
  },
  openHistory: {
    key: "h",
    alt: true,
    shift: true,
    description: "Open history",
    category: "window",
    action: "openHistory",
  },
  openBookmarks: {
    key: "b",
    alt: true,
    shift: true,
    description: "Open bookmarks",
    category: "window",
    action: "openBookmarks",
  },
  addBookmark: {
    key: "d",
    alt: true,
    shift: true,
    description: "Bookmark current page",
    category: "window",
    action: "addBookmark",
  },
  createGroup: {
    key: "g",
    alt: true,
    shift: true,
    description: "Create tab group",
    category: "tabs",
    action: "createGroup",
  },
  ungroupTab: {
    key: "u",
    alt: true,
    shift: true,
    description: "Remove tab from group",
    category: "tabs",
    action: "ungroupTab",
  },
};

export class KeybindManager {
  private keybinds: Record<string, KeybindConfig>;
  private settings: any;

  constructor(settings?: any) {
    this.keybinds = { ...DEFAULT_KEYBINDS };
    this.settings = settings;
  }

  async loadKeybinds(): Promise<void> {
    try {
      const settingsStore = this.settings || window.settings;
      if (!settingsStore) {
        console.warn("Settings API not available, using default keybinds");
        return;
      }
      const stored = await settingsStore.getItem("keybinds");
      if (stored) {
        this.keybinds = { ...DEFAULT_KEYBINDS, ...stored };
      }
    } catch (error) {
      console.warn("Failed to load keybinds:", error);
    }
  }

  async saveKeybinds(): Promise<void> {
    try {
      const settingsStore = this.settings || window.settings;
      if (!settingsStore) {
        console.error("Settings API not available, cannot save keybinds");
        return;
      }
      await settingsStore.setItem("keybinds", this.keybinds);
    } catch (error) {
      console.error("Failed to save keybinds:", error);
    }
  }

  getKeybind(action: string): KeybindConfig | undefined {
    return Object.values(this.keybinds).find((kb) => kb.action === action);
  }

  getAllKeybinds(): Record<string, KeybindConfig> {
    return { ...this.keybinds };
  }

  getKeybindsByCategory(category: string): Record<string, KeybindConfig> {
    return Object.entries(this.keybinds)
      .filter(([_, kb]) => kb.category === category)
      .reduce((acc, [key, kb]) => ({ ...acc, [key]: kb }), {});
  }

  setKeybind(id: string, config: Partial<KeybindConfig>): boolean {
    if (!this.keybinds[id]) return false;

    const existing = this.keybinds[id];
    this.keybinds[id] = { ...existing, ...config };
    this.saveKeybinds();
    return true;
  }

  resetKeybind(id: string): boolean {
    if (!DEFAULT_KEYBINDS[id]) return false;

    this.keybinds[id] = { ...DEFAULT_KEYBINDS[id] };
    this.saveKeybinds();
    return true;
  }

  resetAllKeybinds(): void {
    this.keybinds = { ...DEFAULT_KEYBINDS };
    this.saveKeybinds();
  }

  matchesKeybind(event: KeyboardEvent, config: KeybindConfig): boolean {
    const ctrlMatch = config.ctrl
      ? event.ctrlKey || event.metaKey
      : !event.ctrlKey && !event.metaKey;
    const altMatch = config.alt ? event.altKey : !event.altKey;
    const shiftMatch = config.shift ? event.shiftKey : !event.shiftKey;
    const keyMatch = event.key === config.key;

    return ctrlMatch && altMatch && shiftMatch && keyMatch;
  }

  findMatchingAction(event: KeyboardEvent): string | null {
    for (const [_, config] of Object.entries(this.keybinds)) {
      if (this.matchesKeybind(event, config)) {
        return config.action;
      }
    }
    return null;
  }

  getConflicts(testConfig: KeybindConfig, excludeId?: string): string[] {
    const conflicts: string[] = [];

    for (const [id, config] of Object.entries(this.keybinds)) {
      if (id === excludeId) continue;

      if (
        config.key === testConfig.key &&
        config.ctrl === testConfig.ctrl &&
        config.alt === testConfig.alt &&
        config.shift === testConfig.shift
      ) {
        conflicts.push(id);
      }
    }

    return conflicts;
  }

  formatKeybind(config: KeybindConfig): string {
    const parts: string[] = [];

    if (config.ctrl) parts.push("Ctrl");
    if (config.alt) parts.push("Alt");
    if (config.shift) parts.push("Shift");
    if (config.meta) parts.push("Meta");

    const keyName = this.formatKeyName(config.key);
    parts.push(keyName);

    return parts.join(" + ");
  }

  private formatKeyName(key: string): string {
    const keyMap: Record<string, string> = {
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      " ": "Space",
      Escape: "Esc",
      Enter: "Enter",
      Tab: "Tab",
      Backspace: "Backspace",
      Delete: "Del",
    };

    return keyMap[key] || key.toUpperCase();
  }
}
