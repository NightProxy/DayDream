import { Themeing } from "@js/global/theming";
import { EventSystem } from "@apis/events";

export class InternalPageTheme {
  private theming: Themeing;
  private events: EventSystem;
  private initialized: boolean = false;

  constructor() {
    this.theming = new Themeing();
    this.events = new EventSystem();
  }

  async init(): Promise<void> {
    if (this.initialized) {
      console.warn("Internal page theme system already initialized");
      return;
    }

    try {
      console.log(
        `[${window.location.pathname}] Initializing internal page theme system...`,
      );

      await this.theming.init();

      this.setupThemeSynchronization();

      await this.applyCurrentTheme();

      this.initialized = true;

      console.log(
        `[${window.location.pathname}] Internal page theme system initialized successfully`,
      );
    } catch (error) {
      console.error(
        `[${window.location.pathname}] Failed to initialize internal page theme system:`,
        error,
      );
    }
  }

  private setupThemeSynchronization(): void {
    this.events.addEventListener("theme:global-update", async (event: any) => {
      if (!event.detail) {
        console.warn(
          "Received theme:global-update event without detail:",
          event,
        );
        return;
      }

      const { type, theme, color, colorRole, timestamp } = event.detail;

      if (timestamp && Date.now() - timestamp < 100) {
        return;
      }

      console.log(
        `[${window.location.pathname}] Received global theme update:`,
        event.detail,
      );

      switch (type) {
        case "preset":
          if (theme && theme !== this.theming.currentTheme) {
            console.log(
              `[${window.location.pathname}] Applying theme preset: ${theme}`,
            );
            await this.theming.applyTheme(theme);
          }
          break;

        case "color":
        case "accent":
          if (
            color &&
            (this.theming.currentTheme === "custom" ||
              this.theming.themes[this.theming.currentTheme]?.customizable)
          ) {
            console.log(
              `[${window.location.pathname}] Applying custom color: ${color}`,
            );
            await this.theming.applyCustomMainColor(color);
          }
          break;

        case "colorRole":
          if (colorRole) {
            console.log(
              `[${window.location.pathname}] Applying color role: ${colorRole}`,
            );
            await this.theming.applyColorRole(colorRole);

            if (color) {
              await this.theming.applyCustomMainColor(color);
            }
          }
          break;
      }
    });

    this.events.addEventListener("theme:template-change", async () => {
      console.log(
        `[${window.location.pathname}] Template change detected, reapplying theme`,
      );
      await this.applyCurrentTheme();
    });

    this.events.addEventListener("theme:background-change", async () => {
      console.log(`[${window.location.pathname}] Background change detected`);
      await this.theming.setBackgroundImage();
    });
  }

  private async applyCurrentTheme(): Promise<void> {
    try {
      await this.theming.applyTheme(this.theming.currentTheme);

      if (
        this.theming.customMainColor &&
        (this.theming.currentTheme === "custom" ||
          this.theming.themes[this.theming.currentTheme]?.customizable)
      ) {
        await this.theming.applyCustomMainColor(this.theming.customMainColor);
      }

      if (this.theming.selectedColorRole) {
        await this.theming.applyColorRole(this.theming.selectedColorRole);
      }
    } catch (error) {
      console.error(
        `[${window.location.pathname}] Failed to apply current theme:`,
        error,
      );
    }
  }

  getTheming(): Themeing {
    return this.theming;
  }

  getEvents(): EventSystem {
    return this.events;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async changeTheme(themeName: string): Promise<void> {
    if (!this.initialized) {
      console.error("Theme system not initialized");
      return;
    }

    this.events.emit("theme:preset-change", { theme: themeName });
  }

  async changeColor(color: string): Promise<void> {
    if (!this.initialized) {
      console.error("Theme system not initialized");
      return;
    }

    this.events.emit("theme:color-change", { color });
  }

  async changeColorRole(roleName: string, color?: string): Promise<void> {
    if (!this.initialized) {
      console.error("Theme system not initialized");
      return;
    }

    this.events.emit("theme:color-role-change", { roleName, color });
  }
}

const internalPageTheme = new InternalPageTheme();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    internalPageTheme.init();
  });
} else {
  internalPageTheme.init();
}

export { internalPageTheme };

(window as any).internalPageTheme = internalPageTheme;
