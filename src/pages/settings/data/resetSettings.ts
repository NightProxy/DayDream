
import { SettingsAPI } from "@apis/settings";

const SETTINGS_KEYS_TO_CLEAR = [
  "startupBehavior",
  "startupCustomUrl",

  "aboutBlank",
  "urlCloak",
  "cloakUrl",
  "autoCloak",
  "customTitle",
  "customFavicon",

  "panicKeybind",
  "panicUrl",
  "panicCloseTabs",
  "panicClearData",

  "antiTabClose",
  "homePage",
  "searchSuggestions",

  "devtools",
  "hwAccel",

  "downloadAskLocation",
  "settings.downloadShelfAutoShow", // KEEP prefix — matches runtime reader at shelf.ts:94

  "theme:useThemeBackground",

  "nightplus.premiumProxyRouting",
  "nightplus.turnstileAutoSolve",
];

export async function resetAllSettings(): Promise<void> {
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

  for (const k of SETTINGS_KEYS_TO_CLEAR) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  try {
    const theming = (window as any).theming;
    if (theming?.resetToDefault) await theming.resetToDefault();
  } catch {
    /* ignore */
  }

  try {
    const sps = (window as any).sitePermissionsStore;
    if (sps?.clearAll) await sps.clearAll();
  } catch {
    /* ignore */
  }

  try {
    const fn = (window as any).resetSearchEngines;
    if (typeof fn === "function") await fn();
  } catch {
    /* ignore */
  }

  try {
    const fn = (window as any).resetAllKeybinds;
    if (typeof fn === "function") await fn();
  } catch {
    /* ignore */
  }
}
