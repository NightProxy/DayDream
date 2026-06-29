import { SettingsAPI } from "@apis/settings";
import { Themeing } from "@utils/global/theming";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";
import { tabCloakManager } from "@utils/tabCloak";
// Side-effect import: registers the panic keybind listener AND exposes
// window.triggerPanic on whichever frame loads this module. Pulling it
// into the host shell (which imports DDXGlobal from src/index.ts) means
// the Privacy → Cloaking → Panic "Test" button can call
// window.parent.triggerPanic() from inside the settings iframe.
// See src/pages/settings/sections/privacy.ts:949.
import "@utils/global/panic";

interface DDXGlobalInterface {
  settings: SettingsAPI;
  events: EventSystem;
  theming: Themeing;
  windowing: Windowing;
  init: () => Promise<void>;
}

class DDXGlobal implements DDXGlobalInterface {
  settings: SettingsAPI;
  events: EventSystem;
  theming: Themeing;
  windowing: Windowing;
  constructor() {
    this.settings = new SettingsAPI();
    this.events = new EventSystem();
    this.theming = new Themeing();
    this.windowing = new Windowing();
    this.init();
  }
  async init() {
    this.theming.init();

    if (window === window.top) {
      await tabCloakManager.applyTabCloak();
      await tabCloakManager.applyDisableTabClose();

      this.events.addEventListener("tabCloak:change", async (_event: any) => {
        console.log("Tab cloak change detected, reapplying...");
        await tabCloakManager.applyTabCloak();
      });

      // New unified event from Privacy → Cloaking subpage (Task 15).
      // Re-applies tab title / favicon overrides whenever any cloak
      // toggle changes (autoCloak, urlCloak, customTitle, customFavicon).
      // The about:blank windowing call is intentionally NOT re-fired on
      // change — it's a boot-time effect; toggling it after boot just
      // updates the setting for next launch.
      this.events.addEventListener("cloak:changed", async (_event: any) => {
        console.log("Cloak setting change detected, reapplying tab cloak...");
        await tabCloakManager.applyTabCloak();
      });
    }

    if (window === window.top && this.windowing != null) {
      // Legacy trigger (string-form "true") — keep so existing user
      // configs continue to work. T15 still writes "true"/"false" for
      // autoCloak via writeMap, so this path remains live.
      const autoCloakRaw = await this.settings.getItem("autoCloak");
      const autoCloakOn = autoCloakRaw === "true" || autoCloakRaw === true;

      // New boolean key written by Privacy → Cloaking (Task 15).
      // Accept both forms defensively in case a future migration stores
      // it as a string.
      const aboutBlankRaw = await this.settings.getItem("aboutBlank");
      const aboutBlankOn =
        aboutBlankRaw === true || aboutBlankRaw === "true";

      if (autoCloakOn || aboutBlankOn) {
        // Legacy URL_Cloak selector picks between aboutBlank / blob /
        // off modes. When the new boolean aboutBlank key is the only
        // trigger (no URL_Cloak set), default to the about:blank mode.
        const mode = await this.settings.getItem("URL_Cloak");
        switch (mode) {
          case "a:b":
            this.windowing.aboutBlank();
            break;
          case "blob":
            this.windowing.BlobWindow();
            break;
          case "off":
            break;
          default:
            if (aboutBlankOn) this.windowing.aboutBlank();
            break;
        }
      }
    }
  }
}
export { DDXGlobal };
