class Themeing {
  constructor(settings) {
    this.settings = settings;
  }

  async init() {
    document.documentElement.style.setProperty(
      "--main-color",
      (await this.settings.getItem("themeColor")) || "#aa00ff"
    );

    document.addEventListener("theme:color-change", async (event) => {
      await this.settings.setItem("themeColor", event.detail.color);
      document.documentElement.style.setProperty(
        "--main-color",
        (await this.settings.getItem("themeColor")) || "#aa00ff"
      );
      this.applyThemeFromJsonFile();
    });

    this.applyThemeFromJsonFile();

    document.addEventListener("theme:template-change", async () => {
      this.applyThemeFromJsonFile();
    });

    this.setBackgroundImage();

    document.addEventListener("theme:background-change", async () => {
      this.setBackgroundImage();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/internal/themeing.sw.js");
    }
  }

  async applyThemeFromJsonFile() {
    try {
      const response1 = await fetch("/assets/json/themes/modes.json");
      if (!response1.ok) throw new Error("Failed to load themes.json");

      const themes = await response1.json();
      const response2 = await fetch("/assets/json/themes/rules.json");
      if (!response2.ok) throw new Error("Failed to load rules.json");

      const rules = await response2.json();
      const themeName = await this.settings.getItem("themeCustom");
      const themeColor =
        (await this.settings.getItem("themeColor")) || "rgba(128, 0, 128, 1)";

      if (themeName && themes[themeName]) {
        const theme = themes[themeName];
        const root = document.documentElement;
        const shouldTint = themeName === "T-dark" || themeName === "T-light";
        const noTintKeys = rules["no-tint"][themeName] || [];

        Object.keys(theme).forEach((property) => {
          let color = theme[property];
          if (shouldTint && !noTintKeys.includes(property)) {
            color = this.applyColorTint(color, themeColor, 0.15);
          }
          root.style.setProperty(`--${property}`, color);
        });
      }
    } catch (error) {
      console.error("Error loading or applying theme:", error);
    }
  }

  async setBackgroundImage() {
    const bg = await this.settings.getItem("theme:background-image");
    const fetchBG = await fetch(bg);
    if (fetchBG.ok) {
      document.documentElement.style.setProperty(
        "--background-image",
        `url(${bg || "/assets/imgs/DDX.bg.jpeg"})`
      );
    } 
    if (!fetchBG.ok) {
      document.documentElement.style.setProperty(
        "--background-image",
        "url(/assets/imgs/DDX.bg.jpeg)"
      );
    }
    console.log("Background image set");
  }

  applyColorTint(color, tintColor, tintFactor = 0.5) {
    const colorMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/
    );
    const tintMatch = tintColor.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/
    );

    if (!colorMatch || !tintMatch) return color;

    let [r, g, b, a] = colorMatch.slice(1).map(Number);
    let [tr, tg, tb] = tintMatch.slice(1, 4).map(Number);

    // Ensure `a` is a valid number, default to 1 if NaN
    a = isNaN(a) ? 1 : a;

    r = Math.round(r * (1 - tintFactor) + tr * tintFactor);
    g = Math.round(g * (1 - tintFactor) + tg * tintFactor);
    b = Math.round(b * (1 - tintFactor) + tb * tintFactor);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}
