import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";

interface ThemePreset {
  name: string;
  description: string;
  "background-color": string;
  "hover-background-color": string;
  "input-background-color": string;
  "tab-bg-color": string;
  "tab-active-bg-color": string;
  "utility-background-color": string;
  "dark-translucent-bg": string;
  "border-color": string;
  "text-color": string;
  "hover-text-color": string;
  "active-text-color": string;
  "main-color": string;
  "faded-main-color": string;
  "accent-colors": string[];
  "color-roles"?: Record<string, string>;
  customizable?: boolean;
}

interface ThemeingInterface {
  settings: SettingsAPI;
  events: EventSystem;
  themes: Record<string, ThemePreset>;
  currentTheme: string;
  customMainColor: string | null;
  selectedColorRole: string | null;
  init: () => Promise<void>;
  loadThemePresets: () => Promise<void>;
  applyTheme: (themeName: string) => Promise<void>;
  applyCustomMainColor: (color: string) => Promise<void>;
  applyColorRole: (roleName: string) => Promise<void>;
  setBackgroundImage: () => Promise<void>;
  applyColorTint: (
    color: string,
    tintColor: string,
    tintFactor?: number,
  ) => string;
  fadeColor: (color: string, factor: number) => string;
  getAccentColors: (themeName?: string) => string[];
  getColorRoles: (themeName?: string) => Record<string, string>;
  generateColorVariations: (baseColor: string) => Record<string, string>;
}

class Themeing implements ThemeingInterface {
  settings: SettingsAPI;
  events: EventSystem;
  themes: Record<string, ThemePreset> = {};
  currentTheme: string = "catppuccin-mocha";
  customMainColor: string | null = null;
  selectedColorRole: string | null = null;

  constructor() {
    this.settings = new SettingsAPI();
    this.events = new EventSystem();
  }

  async init() {
    await this.loadThemePresets();

    try {
      this.currentTheme =
        (await this.settings.getItem("currentTheme")) || "catppuccin-mocha";
    } catch (error) {
      console.warn(
        "Could not load currentTheme setting, using default:",
        error,
      );
      this.currentTheme = "catppuccin-mocha";
    }

    try {
      this.customMainColor = await this.settings.getItem("themeColor");
    } catch (error) {
      console.warn("Could not load themeColor setting:", error);
      this.customMainColor = null;
    }

    try {
      this.selectedColorRole = await this.settings.getItem("selectedColorRole");
    } catch (error) {
      console.warn("Could not load selectedColorRole setting:", error);
      this.selectedColorRole = null;
    }

    await this.applyTheme(this.currentTheme);

    this.events.addEventListener("theme:preset-change", async (event: any) => {
      const { theme } = event.detail;
      if (theme !== this.currentTheme) {
        this.currentTheme = theme;
        try {
          await this.settings.setItem("currentTheme", this.currentTheme);
        } catch (error) {
          console.warn("Could not save currentTheme setting:", error);
        }
        await this.applyTheme(this.currentTheme);

        // Emit cross-page update for other pages/iframes
        this.events.emit("theme:global-update", {
          type: "preset",
          theme: theme,
          timestamp: Date.now(),
        });
      }
    });

    this.events.addEventListener("theme:color-change", async (event: any) => {
      const { color } = event.detail;
      this.customMainColor = color;
      if (this.customMainColor) {
        try {
          await this.settings.setItem("themeColor", this.customMainColor);
        } catch (error) {
          console.warn("Could not save themeColor setting:", error);
        }
      }

      // If we're in custom mode or a theme that allows customization, apply the color
      if (
        this.customMainColor &&
        (this.currentTheme === "custom" ||
          this.themes[this.currentTheme]?.customizable)
      ) {
        await this.applyCustomMainColor(this.customMainColor);

        // Emit cross-page update for other pages/iframes
        this.events.emit("theme:global-update", {
          type: "color",
          color: this.customMainColor,
          theme: this.currentTheme,
          timestamp: Date.now(),
        });
      }
    });

    this.events.addEventListener("theme:accent-change", async (event: any) => {
      const { color } = event.detail;
      if (
        this.currentTheme === "custom" ||
        this.themes[this.currentTheme]?.customizable
      ) {
        await this.applyCustomMainColor(color);
        this.customMainColor = color;
        await this.settings.setItem("themeColor", color);

        // Emit cross-page update for other pages/iframes
        this.events.emit("theme:global-update", {
          type: "accent",
          color: color,
          theme: this.currentTheme,
          timestamp: Date.now(),
        });
      }
    });

    this.events.addEventListener(
      "theme:color-role-change",
      async (event: any) => {
        const { roleName, color } = event.detail;
        await this.applyColorRole(roleName);

        // If a specific color is provided with the role, use it
        if (color) {
          await this.applyCustomMainColor(color);
          this.customMainColor = color;
          await this.settings.setItem("themeColor", color);
        }

        this.selectedColorRole = roleName;
        await this.settings.setItem("selectedColorRole", roleName);

        // Emit cross-page update for other pages/iframes
        this.events.emit("theme:global-update", {
          type: "colorRole",
          colorRole: roleName,
          color: color,
          theme: this.currentTheme,
          timestamp: Date.now(),
        });
      },
    );

    // Listen for global theme updates from other pages
    this.events.addEventListener("theme:global-update", async (event: any) => {
      // Safety check for event.detail
      if (!event.detail) {
        console.warn(
          "Received theme:global-update event without detail:",
          event,
        );
        return;
      }

      const { type, theme, color, colorRole, timestamp } = event.detail;

      // Prevent processing our own events (basic loop prevention)
      if (timestamp && Date.now() - timestamp < 100) {
        return;
      }

      console.log("Received global theme update:", event.detail);

      switch (type) {
        case "preset":
          if (theme && theme !== this.currentTheme) {
            this.currentTheme = theme;
            await this.settings.setItem("currentTheme", this.currentTheme);
            await this.applyTheme(this.currentTheme);
          }
          break;

        case "color":
        case "accent":
          if (
            color &&
            (this.currentTheme === "custom" ||
              this.themes[this.currentTheme]?.customizable)
          ) {
            this.customMainColor = color;
            await this.settings.setItem("themeColor", color);
            await this.applyCustomMainColor(color);
          }
          break;

        case "colorRole":
          if (colorRole) {
            this.selectedColorRole = colorRole;
            try {
              await this.settings.setItem("selectedColorRole", colorRole);
            } catch (error) {
              console.warn("Could not save selectedColorRole setting:", error);
            }
            await this.applyColorRole(colorRole);

            if (color) {
              this.customMainColor = color;
              try {
                await this.settings.setItem("themeColor", color);
              } catch (error) {
                console.warn("Could not save themeColor setting:", error);
              }
              await this.applyCustomMainColor(color);
            }
          }
          break;
      }
    });

    this.events.addEventListener("theme:template-change", async () => {
      await this.applyTheme(this.currentTheme);
    });

    this.setBackgroundImage();

    this.events.addEventListener("theme:background-change", async () => {
      this.setBackgroundImage();
    });
  }

  async loadThemePresets() {
    try {
      const response = await fetch("/json/themes/presets.json");
      if (!response.ok) throw new Error("Failed to load theme presets");

      this.themes = await response.json();
    } catch (error) {
      console.error("Error loading theme presets:", error);
      // Fallback to basic themes if loading fails
      this.themes = {
        custom: {
          name: "Custom",
          description: "Create your own theme",
          "background-color": "rgba(0, 0, 0, 1)",
          "hover-background-color": "rgba(140, 0, 255, 0.13)",
          "input-background-color": "rgba(10, 10, 10, 1)",
          "tab-bg-color": "rgba(22, 22, 22, 1)",
          "tab-active-bg-color": "rgba(51, 51, 51, 1)",
          "utility-background-color": "rgba(22, 22, 22, 1)",
          "dark-translucent-bg": "rgba(61, 61, 61, 0.43)",
          "border-color": "rgba(82, 82, 82, 1)",
          "text-color": "rgba(255, 255, 255, 1)",
          "hover-text-color": "rgba(255, 255, 255, 0.49)",
          "active-text-color": "rgba(255, 255, 255, 0.81)",
          "main-color": "rgba(141, 1, 255, 1)",
          "faded-main-color": "rgba(170, 1, 255, 0.26)",
          "accent-colors": [
            "#8d01ff",
            "#aa00ff",
            "#7b01cc",
            "#9900cc",
            "#b300ff",
            "#cc01ff",
          ],
          customizable: true,
        },
      };
    }
  }

  async applyTheme(themeName: string) {
    if (!this.themes[themeName]) {
      console.warn(
        `Theme "${themeName}" not found, falling back to custom theme`,
      );
      themeName = "custom";
    }

    const theme = this.themes[themeName];
    const root = document.documentElement;

    // Apply all theme properties
    Object.entries(theme).forEach(([property, value]) => {
      if (
        property === "name" ||
        property === "description" ||
        property === "accent-colors" ||
        property === "customizable"
      ) {
        return; // Skip metadata properties
      }

      if (typeof value === "string") {
        root.style.setProperty(`--${property}`, value);
      }
    });

    // Apply background color to body as well
    if (theme["background-color"]) {
      document.body.style.backgroundColor = theme["background-color"];
    }

    // Apply text color to body as well
    if (theme["text-color"]) {
      document.body.style.color = theme["text-color"];
    }

    // Update legacy CSS variables for compatibility
    if (theme["background-color"]) {
      root.style.setProperty("--bg-2", theme["background-color"]);
    }
    if (theme["input-background-color"]) {
      root.style.setProperty("--bg-1", theme["input-background-color"]);
    }
    if (theme["text-color"]) {
      root.style.setProperty("--text", theme["text-color"]);
    }

    // Apply custom main color if available and theme allows it
    if (
      this.customMainColor &&
      (themeName === "custom" || theme.customizable)
    ) {
      await this.applyCustomMainColor(this.customMainColor);
    }

    // Update the main color CSS variable for compatibility
    const mainColor = this.customMainColor || theme["main-color"];
    root.style.setProperty("--main-color", mainColor);
    root.style.setProperty("--main", mainColor); // For compatibility

    // Generate and apply color variations
    const colorVariations = this.generateColorVariations(mainColor);
    Object.entries(colorVariations).forEach(([property, value]) => {
      root.style.setProperty(`--${property}`, value);
    });

    console.log(`Applied theme: ${theme.name}`);
  }

  async applyCustomMainColor(color: string) {
    const root = document.documentElement;

    root.style.setProperty("--main-color", color);
    root.style.setProperty("--main", color); // For compatibility

    // Generate and apply color variations
    const variations = this.generateColorVariations(color);
    Object.entries(variations).forEach(([property, value]) => {
      root.style.setProperty(`--${property}`, value);
    });

    // Update hover background color based on main color
    const fadedMainColor = this.fadeColor(color, 0.26);
    root.style.setProperty("--faded-main-color", fadedMainColor);
    root.style.setProperty(
      "--hover-background-color",
      this.fadeColor(color, 0.13),
    );
  }

  generateColorVariations(baseColor: string): Record<string, string> {
    return {
      "main-20a": `color-mix(in oklab, ${baseColor} 20%, transparent)`,
      "main-35a": `color-mix(in oklab, ${baseColor} 35%, transparent)`,
      "faded-main-color": this.fadeColor(baseColor, 0.26),
    };
  }

  async setBackgroundImage() {
    // Background image functionality removed - using theme background colors only
    console.log(
      "Background image functionality disabled - using theme background colors",
    );
  }

  getAccentColors(themeName?: string): string[] {
    const theme = this.themes[themeName || this.currentTheme];
    return theme?.["accent-colors"] || [];
  }

  getColorRoles(themeName?: string): Record<string, string> {
    const theme = this.themes[themeName || this.currentTheme];
    return theme?.["color-roles"] || {};
  }

  async applyColorRole(roleName: string) {
    const theme = this.themes[this.currentTheme];
    if (!theme?.["color-roles"]?.[roleName]) {
      console.warn(
        `Color role "${roleName}" not found in theme "${this.currentTheme}"`,
      );
      return;
    }

    const color = theme["color-roles"][roleName];
    this.selectedColorRole = roleName;
    await this.settings.setItem("selectedColorRole", roleName);
    await this.applyCustomMainColor(color);

    console.log(`Applied color role "${roleName}" with color "${color}"`);
  }

  applyColorTint(color: string, tintColor: string, tintFactor: number = 0.5) {
    const colorMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/,
    );
    const tintMatch = tintColor.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/,
    );

    if (!colorMatch || !tintMatch) return color;

    let [r, g, b, a] = colorMatch.slice(1).map(Number);
    let [tr, tg, tb] = tintMatch.slice(1, 4).map(Number);

    a = isNaN(a) ? 1 : a;

    r = Math.round(r * (1 - tintFactor) + tr * tintFactor);
    g = Math.round(g * (1 - tintFactor) + tg * tintFactor);
    b = Math.round(b * (1 - tintFactor) + tb * tintFactor);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  fadeColor(color: string, factor: number) {
    if (typeof color !== "string") {
      console.error("Invalid color input:", color);
      return color;
    }

    const colorMatch = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d\.]+)?\)/,
    );

    if (!colorMatch) {
      // Try hex color
      const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
      if (hexMatch) {
        const hex = hexMatch[1];
        let r, g, b;

        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        } else {
          console.error("Invalid hex color format:", color);
          return color;
        }

        return `rgba(${r}, ${g}, ${b}, ${factor})`;
      }

      console.error("Color does not match rgba, rgb, or hex format:", color);
      return color;
    }

    let [r, g, b, a] = colorMatch.slice(1).map(Number);
    a = isNaN(a) ? 1 : a;
    a = Math.min(1, Math.max(0, a * factor));

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}

export { Themeing, type ThemePreset };
