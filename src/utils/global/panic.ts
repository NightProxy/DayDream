import { SettingsAPI } from "@apis/settings";

const STORAGE_KEY = "panicKeybind";
let initialized = false;

const normalize = (s: string) => s?.trim().toLowerCase();

/**
 * Panic trigger — reads runtime settings written by Privacy → Cloaking →
 * Panic button (Task 15) and performs the configured escape sequence:
 *   1. Optionally close all tabs (panicCloseTabs, default true).
 *   2. Optionally clear profile + storage data (panicClearData, default
 *      false).
 *   3. Navigate to the configured redirect URL (panicUrl, default
 *      "about:blank").
 *
 * Every step is best-effort with isolated try/catch so a failure in one
 * step never prevents the navigation — the whole point of panic is to
 * leave the page immediately even when the rest of the runtime is
 * broken.
 */
const triggerPanic = async (): Promise<void> => {
  const settingsAPI = new SettingsAPI();

  let panicUrl = "about:blank";
  let closeTabs = true;
  let clearData = false;
  try {
    const u = await settingsAPI.getItem("panicUrl");
    if (typeof u === "string" && u.trim()) panicUrl = u.trim();
  } catch {
    /* keep default */
  }
  try {
    const c = await settingsAPI.getItem("panicCloseTabs");
    if (c === false || c === "false") closeTabs = false;
  } catch {
    /* keep default true */
  }
  try {
    const d = await settingsAPI.getItem("panicClearData");
    if (d === true || d === "true") clearData = true;
  } catch {
    /* keep default false */
  }

  try {
    const disableTabClose =
      (await settingsAPI.getItem("disableTabClose")) || "false";
    if (disableTabClose === "true") {
      await settingsAPI.setItem("disableTabClose", "false");
    }
  } catch {
    /* ignore */
  }

  if (closeTabs) {
    try {
      const tabs = (window as any).tabs;
      if (tabs?.closeAllTabs) {
        await tabs.closeAllTabs();
      } else if (typeof tabs?.tabs?.forEach === "function") {
        tabs.tabs.forEach((t: any) => {
          try {
            tabs.closeTabById?.(t.id);
          } catch {
            /* ignore individual close failures */
          }
        });
      }
    } catch (err) {
      console.warn("[panic] closeAllTabs failed:", err);
    }
  }

  if (clearData) {
    try {
      const profiles = (window as any).profiles;
      if (typeof profiles?.clearCurrentProfileData === "function") {
        await profiles.clearCurrentProfileData();
      }
    } catch (err) {
      console.warn("[panic] clearCurrentProfileData failed:", err);
    }
    try {
      localStorage.clear();
    } catch {
      /* may throw in restricted contexts */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* may throw in restricted contexts */
    }
  }

  const target = panicUrl;
  if (window.top && window.top !== window.self) {
    try {
      window.top.location.assign(target);
    } catch {
      /* cross-origin top — fall through to local navigate */
    }
    setTimeout(() => {
      try {
        if (window.top && window.top !== window.self)
          window.location.replace("about:blank");
      } catch {
        /* ignore */
      }
    }, 200);
  } else {
    try {
      window.location.assign(target);
    } catch (err) {
      console.warn("[panic] window.location.assign failed:", err);
    }
  }
};

if (typeof window !== "undefined") {
  (window as any).triggerPanic = triggerPanic;
}

(async () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const settingsAPI = new SettingsAPI();
  const saved = (await settingsAPI.getItem(STORAGE_KEY)) || "`";
  let keybind = normalize(String(saved));

  window.addEventListener(
    "keydown",
    (e) => {
      if (normalize(e.key) === keybind) triggerPanic();
    },
    { passive: true },
  );
})();
