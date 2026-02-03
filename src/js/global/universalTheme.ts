import { Themeing } from "@js/global/theming";
import { EventSystem } from "@apis/events";

class UniversalThemeInit {
  private theming: Themeing;
  private events: EventSystem;
  private initialized: boolean = false;

  constructor() {
    this.theming = new Themeing();
    this.events = new EventSystem();
  }

  async init() {
    if (this.initialized) {
      console.warn("Theme system already initialized");
      return;
    }

    try {
      await this.theming.init();
      this.initialized = true;

      this.setupDebugListeners();

      console.log("Universal theme system initialized successfully");
    } catch (error) {
      console.error("Failed to initialize universal theme system:", error);
    }
  }

  private setupDebugListeners() {
    this.events.addEventListener("theme:global-update", (event: any) => {
      console.log(
        `[${window.location.pathname}] Global theme update:`,
        event.detail,
      );
    });

    this.events.addEventListener("theme:preset-change", (event: any) => {
      console.log(
        `[${window.location.pathname}] Theme preset change:`,
        event.detail,
      );
    });

    this.events.addEventListener("theme:color-change", (event: any) => {
      console.log(
        `[${window.location.pathname}] Theme color change:`,
        event.detail,
      );
    });

    this.events.addEventListener("theme:accent-change", (event: any) => {
      console.log(
        `[${window.location.pathname}] Accent color change:`,
        event.detail,
      );
    });

    this.events.addEventListener("theme:color-role-change", (event: any) => {
      console.log(
        `[${window.location.pathname}] Color role change:`,
        event.detail,
      );
    });
  }

  async changeTheme(themeName: string) {
    this.events.emit("theme:preset-change", { theme: themeName });
  }

  async changeColor(color: string) {
    this.events.emit("theme:color-change", { color });
  }

  getTheming(): Themeing {
    return this.theming;
  }

  getEvents(): EventSystem {
    return this.events;
  }
}

const universalTheme = new UniversalThemeInit();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    universalTheme.init();
  });
} else {
  universalTheme.init();
}

export { UniversalThemeInit, universalTheme };
