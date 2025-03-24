import { SettingsAPI } from "/assets/js/apis/settings.js";
import { Themeing } from "/assets/js/global/theming.js";
import { Windowing } from "/assets/js/browser/windowing.js";

class Global {
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
