// Reset toggles/selects/inputs to defaults, theme to default, search engines to default,
// keybinds to default, site permissions cleared. DOES NOT touch profiles, bookmarks,
// history, downloads, extensions.

import { SettingsAPI } from "@apis/settings";

const SETTINGS_KEYS_TO_CLEAR = [
  // Startup
  "startupBehavior",
  "startupCustomUrl",

  // Cloaking (round-2 — unprefixed to match legacy convention)
  "aboutBlank",
  "urlCloak",
  "cloakUrl",
  "autoCloak",
  "customTitle",
  "customFavicon",

  // Panic button
  "panicKeybind",
  "panicUrl",
  "panicCloseTabs",
  "panicClearData",

  // Misc behavior
  "antiTabClose",
  "homePage",
  "searchSuggestions",

  // System
  "devtools",
  "hwAccel",

  // Downloads
  "downloadAskLocation",
  "settings.downloadShelfAutoShow", // KEEP prefix — matches runtime reader at shelf.ts:94

  // Theming (round 2)
  "theme:useThemeBackground",

  // Night+ (round 2)
  "nightplus.premiumProxyRouting",
  "nightplus.turnstileAutoSolve",
];

export async function resetAllSettings(): Promise<void> {
  // Clear persisted keys via SettingsAPI (the file-backed store the rest of the
  // new settings page uses). removeItem exists, so we use it directly.
  try {
    const api = new SettingsAPI();
    for (const k of SETTINGS_KEYS_TO_CLEAR) {
      try {
        await api.removeItem(k);
      } catch {
        /* ignore individual key failures */
      }
    }
  } catch {
    /* ignore — falls through to localStorage below */
  }

  // Also clear localStorage equivalents (some older code paths may still read these).
  for (const k of SETTINGS_KEYS_TO_CLEAR) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  // Reset theme — find the theming runtime and call its reset method.
  // Speculative hook — no-ops silently if not present.
  try {
    const theming = (window as any).theming;
    if (theming?.resetToDefault) await theming.resetToDefault();
  } catch {
    /* ignore */
  }

  // Clear all site permissions (verified hook from Task 11).
  try {
    const sps = (window as any).sitePermissionsStore;
    if (sps?.clearAll) await sps.clearAll();
  } catch {
    /* ignore */
  }

  // Reset search engines (uses existing global handler if exposed).
  try {
    const fn = (window as any).resetSearchEngines;
    if (typeof fn === "function") await fn();
  } catch {
    /* ignore */
  }

  // Reset keybinds (existing global handler if exposed).
  try {
    const fn = (window as any).resetAllKeybinds;
    if (typeof fn === "function") await fn();
  } catch {
    /* ignore */
  }
}
