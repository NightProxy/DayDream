import type { ThemePreset } from "@js/global/theming";

export class ThemeManager {
  private themes: Record<string, ThemePreset> = {};
  private currentTheme: string = "custom";

  constructor() {}

  async loadThemes(): Promise<Record<string, ThemePreset>> {
    try {
      const response = await fetch("/json/themes/presets.json");
      if (!response.ok) throw new Error("Failed to load themes");

      this.themes = await response.json();
      return this.themes;
    } catch (error) {
      console.error("Failed to load themes:", error);
      return {};
    }
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
