import { SettingsAPI } from "@apis/settings";
import { Themeing } from "@utils/global/theming";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";
import { tabCloakManager } from "@utils/tabCloak";
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

      this.events.addEventListener("cloak:changed", async (_event: any) => {
        console.log("Cloak setting change detected, reapplying tab cloak...");
        await tabCloakManager.applyTabCloak();
      });
    }

    if (window === window.top && this.windowing != null) {
      const autoCloakRaw = await this.settings.getItem("autoCloak");
      const autoCloakOn = autoCloakRaw === "true" || autoCloakRaw === true;

      const aboutBlankRaw = await this.settings.getItem("aboutBlank");
      const aboutBlankOn =
        aboutBlankRaw === true || aboutBlankRaw === "true";

      if (autoCloakOn || aboutBlankOn) {
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
