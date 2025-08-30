import { Themeing } from "@js/global/theming";
import { EventSystem } from "@apis/events";

/**
 * Universal Theme Initializer
 * Include this in any page to automatically set up cross-page theme synchronization
 */
class UniversalThemeInit {
  private theming: Themeing;
  private events: EventSystem;
  private initialized: boolean = false;

  constructor() {
    this.theming = new Themeing();
    this.events = new EventSystem();
  }

  /**
   * Initialize the theme system on the current page
   */
  async init() {
    if (this.initialized) {
      console.warn("Theme system already initialized");
      return;
    }

    try {
      // Initialize the theming system
      await this.theming.init();
      this.initialized = true;

      // Add page-specific event listeners for debugging
      this.setupDebugListeners();

      console.log("Universal theme system initialized successfully");
    } catch (error) {
      console.error("Failed to initialize universal theme system:", error);
    }
  }

  /**
   * Set up debug listeners to log theme changes
   */
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

  /**
   * Manually trigger a theme change
   */
  async changeTheme(themeName: string) {
    this.events.emit("theme:preset-change", { theme: themeName });
  }

  /**
   * Manually trigger a color change
   */
  async changeColor(color: string) {
    this.events.emit("theme:color-change", { color });
  }

  /**
   * Get the current theme instance
   */
  getTheming(): Themeing {
    return this.theming;
  }

  /**
   * Get the events system instance
   */
  getEvents(): EventSystem {
    return this.events;
  }
}

// Create a global instance
const universalTheme = new UniversalThemeInit();

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    universalTheme.init();
  });
} else {
  // DOM is already ready
  universalTheme.init();
}

// Export for manual usage
export { UniversalThemeInit, universalTheme };
