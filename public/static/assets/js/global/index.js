class Global {
  constructor(settings, windowing = null) {
    this.settings = settings;
    this.theming = new Themeing(settings);
    if (windowing != null) {
      this.windowing = windowing;
    }
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
