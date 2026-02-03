import type { ThemePreset } from "@js/global/theming";

export class ThemeManager {
  private themes: Record<string, ThemePreset> = {};
  private currentTheme: string = "custom";

  constructor() {}

  async loadThemes(): Promise<Record<string, ThemePreset>> {
    try {
      console.log("Loading themes from /json/t.json");
      const response = await fetch("/json/t.json");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid content type, expected JSON");
      }

      const themesData = await response.json();

      if (!themesData || typeof themesData !== "object") {
        throw new Error("Invalid themes data format");
      }

      const validatedThemes: Record<string, ThemePreset> = {};
      let validThemeCount = 0;

      for (const [key, theme] of Object.entries(themesData)) {
        if (this.isValidTheme(theme as any)) {
          validatedThemes[key] = theme as ThemePreset;
          validThemeCount++;
        } else {
          console.warn(`Invalid theme data for '${key}', skipping`);
        }
      }

      if (validThemeCount === 0) {
        throw new Error("No valid themes found in loaded data");
      }

      this.themes = validatedThemes;
      console.log(
        `Successfully loaded ${validThemeCount} themes:`,
        Object.keys(validatedThemes),
      );
      return this.themes;
    } catch (error) {
      console.error("Failed to load themes:", error);
      console.log("Using fallback theme");

      const fallbackThemes = this.getFallbackThemes();
      this.themes = fallbackThemes;
      return fallbackThemes;
    }
  }

  private isValidTheme(theme: any): boolean {
    const requiredProperties = [
      "name",
      "background-color",
      "text-color",
      "main-color",
    ];

    return (
      theme &&
      typeof theme === "object" &&
      requiredProperties.every(
        (prop) => prop in theme && typeof theme[prop] === "string",
      )
    );
  }

  private getFallbackThemes(): Record<string, ThemePreset> {
    return {
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
      "catppuccin-mocha": {
        name: "Catppuccin Mocha",
        description: "The warmer and darker variant of Catppuccin",
        "background-color": "rgba(24, 24, 37, 1)",
        "hover-background-color": "rgba(203, 166, 247, 0.13)",
        "input-background-color": "rgba(30, 30, 46, 1)",
        "tab-bg-color": "rgba(49, 50, 68, 1)",
        "tab-active-bg-color": "rgba(88, 91, 112, 1)",
        "utility-background-color": "rgba(49, 50, 68, 1)",
        "dark-translucent-bg": "rgba(88, 91, 112, 0.43)",
        "border-color": "rgba(88, 91, 112, 1)",
        "text-color": "rgba(205, 214, 244, 1)",
        "hover-text-color": "rgba(205, 214, 244, 0.7)",
        "active-text-color": "rgba(203, 166, 247, 1)",
        "main-color": "rgba(203, 166, 247, 1)",
        "faded-main-color": "rgba(203, 166, 247, 0.26)",
        "accent-colors": [
          "#cba6f7",
          "#89b4fa",
          "#94e2d5",
          "#a6e3a1",
          "#f9e2af",
          "#f38ba8",
        ],
        "color-roles": {
          mauve: "#cba6f7",
          blue: "#89b4fa",
          teal: "#94e2d5",
          green: "#a6e3a1",
          yellow: "#f9e2af",
          pink: "#f38ba8",
        },
        customizable: true,
      },
    };
  }

  getTheme(themeName: string): ThemePreset | null {
    return this.themes[themeName] || null;
  }

  getAllThemes(): Record<string, ThemePreset> {
    return this.themes;
  }

  setCurrentTheme(themeName: string): void {
    if (this.themes[themeName]) {
      this.currentTheme = themeName;
    }
  }

  getCurrentTheme(): string {
    return this.currentTheme;
  }

  getThemeAccentColors(themeName?: string): string[] {
    const theme = this.getTheme(themeName || this.currentTheme);
    return theme?.["accent-colors"] || [];
  }

  getThemeColorRoles(themeName?: string): Record<string, string> {
    const theme = this.getTheme(themeName || this.currentTheme);
    return theme?.["color-roles"] || {};
  }

  isThemeCustomizable(themeName?: string): boolean {
    const theme = this.getTheme(themeName || this.currentTheme);
    return theme?.customizable === true || themeName === "custom";
  }

  generateThemePreview(theme: ThemePreset): HTMLElement {
    const container = document.createElement("div");
    container.className = "theme-preset-button";

    container.style.backgroundColor = theme["background-color"];
    container.style.color = theme["text-color"];

    container.innerHTML = `
      <div class="theme-colors-preview">
        <div class="theme-preset-color-dot" style="background-color: ${theme["main-color"]}"></div>
        <div class="theme-preset-color-dot" style="background-color: ${theme["tab-bg-color"] || theme["utility-background-color"]}"></div>
        <div class="theme-preset-color-dot" style="background-color: ${theme["border-color"]}"></div>
      </div>
      <div class="theme-info">
        <div class="theme-name" style="color: ${theme["text-color"]}">${theme.name}</div>
        <div class="theme-description" style="color: ${theme["hover-text-color"] || theme["text-color"]}">${theme.description}</div>
      </div>
    `;

    return container;
  }

  generateAccentColorButton(color: string): HTMLElement {
    const button = document.createElement("button");
    button.className = "accent-color-button";
    button.style.backgroundColor = color;
    button.setAttribute("data-color", color);
    return button;
  }

  hexToRgba(hex: string, alpha: number = 1): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  generateColorVariations(baseColor: string): Record<string, string> {
    return {
      "main-20a": `color-mix(in oklab, ${baseColor} 20%, transparent)`,
      "main-35a": `color-mix(in oklab, ${baseColor} 35%, transparent)`,
      "hover-background": `color-mix(in oklab, ${baseColor} 13%, transparent)`,
    };
  }

  isValidColor(color: string): boolean {
    const hexPattern = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    const rgbaPattern = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/;

    return hexPattern.test(color) || rgbaPattern.test(color);
  }

  getContrastingTextColor(backgroundColor: string): string {
    const getRgbValues = (color: string) => {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }

      const hex = color.replace("#", "");
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }

      return [0, 0, 0];
    };

    const [r, g, b] = getRgbValues(backgroundColor);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > 128 ? "#000000" : "#ffffff";
  }
}

export const themeManager = new ThemeManager();
