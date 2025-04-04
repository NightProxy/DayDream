import { SettingsAPI } from "@apis/settings";
import { Themeing } from "@js/global/theming";
import { Windowing } from "@browser/windowing";

interface GlobalInterface {
  settings: SettingsAPI;
  theming: Themeing;
  windowing: Windowing;
  init: () => Promise<void>;
}

class Global implements GlobalInterface {
  settings: SettingsAPI;
  theming: Themeing;
  windowing: Windowing;
  constructor() {
    this.settings = new SettingsAPI();
    this.theming = new Themeing();
    this.windowing = new Windowing();
    this.init();
  }
  async init() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/internal/icons.sw.js");
    }
    this.theming.init();
    if (
      window === window.top &&
      this.windowing != null &&
      (await this.settings.getItem("autoCloak")) === "true"
    ) {
      switch (await this.settings.getItem("URL_Cloak")) {
        case "a:b":
          this.windowing.aboutBlank();
          break;
        case "blob":
          this.windowing.BlobWindow();
          break;
        case "off":
          break;
        default:
          break;
      }
    }
  }
}
export { Global };
