class Themeing {
  constructor(settings) {
    this.settings = settings;
  }

  async init() {
    document.documentElement.style.setProperty(
      "--main-color",
      (await this.settings.getItem("themeColor")) || "#aa00ff"
    );
    const fadedMainColor = this.fadeColor(
      await this.settings.getItem("themeColor"),
      "0.26"
    ) || "rgba(170, 1, 255, 0.26)";
    document.documentElement.style.setProperty(
      "--faded-main-color",
      fadedMainColor || "rgba(170, 1, 255, 0.26)"
    );

    document.addEventListener("theme:color-change", async (event) => {
      await this.settings.setItem("themeColor", event.detail.color);
      document.documentElement.style.setProperty(
        "--main-color",
        (await this.settings.getItem("themeColor")) || "#aa00ff"
      );
      const fadedMainColor = this.fadeColor(
        await this.settings.getItem("themeColor"),
        "0.26"
      ) || "rgba(170, 1, 255, 0.26)";
      document.documentElement.style.setProperty(
        "--faded-main-color",
        fadedMainColor || "rgba(170, 1, 255, 0.26)"
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

    this.setLogo();

    document.addEventListener("theme:logo-change", async (event) => {
      this.setLogo();
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
      const uiStyle = await this.settings.getItem("UIStyle");

      if (themeName && themes[themeName]) {
        const theme = themes[themeName];
        const root = document.documentElement;
        const shouldTint = themeName === "T-dark" || themeName === "T-light";
        const uiStyleRules = rules[uiStyle] || {};
        const noTintKeys = uiStyleRules["no-tint"]?.[themeName] || [];
        const tintAmounts = uiStyleRules["tint-amounts"] || {};

        Object.keys(theme).forEach((property) => {
          let color = theme[property];
          if (shouldTint && !noTintKeys.includes(property)) {
            color = this.applyColorTint(
              color,
              themeColor,
              tintAmounts[property] || 0.35
            );
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
    if (bg !== null) {
      const fetchBG = await fetch(bg);
      if (fetchBG.ok) {
        document.documentElement.style.setProperty(
          "--background-image",
          `url(${bg || "/assets/imgs/DDX.bg.jpeg"})`
        );
      }
    } else {
      document.documentElement.style.setProperty(
        "--background-image",
        "url(/assets/imgs/DDX.bg.jpeg)"
      );
    }
    console.log("Background image set");
  }
  async setLogo() {
    const logo = await this.settings.getItem("theme:logo");
    if (logo !== null) {
      const fetchLogo = await fetch(logo);
      if (fetchLogo.ok) {
        document.documentElement.style.setProperty(
          "--logo",
          `url(${logo || "/assets/imgs/logo.png"})`
        );
      }
    } else {
      document.documentElement.style.setProperty(
        "--logo",
        "url(/assets/imgs/logo.png)"
      );
    }
    console.log("Logo set");
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

  fadeColor(color, factor) {
    if (typeof color !== 'string') {
      console.error("Invalid color input:", color);
      return color; // Return the original input if it's invalid
    }

    const colorMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/
    );

    if (!colorMatch) {
      console.error("Color does not match rgba or rgb format:", color);
      return color;
    }

    let [r, g, b, a] = colorMatch.slice(1).map(Number);
    a = isNaN(a) ? 1 : a; // Default to 1 if `a` is NaN
    a = Math.min(1, Math.max(0, a * factor)); // Clamp alpha to valid range

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

}
