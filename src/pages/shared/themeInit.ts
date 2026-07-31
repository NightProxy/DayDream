import { Themeing } from "@utils/global/theming";
import { EventSystem } from "@apis/events";

export class InternalPageTheme {
  private theming: Themeing;
  private events: EventSystem;
  private initialized: boolean = false;

  constructor() {
    this.theming = new Themeing();
    this.events = new EventSystem();
  }

  /**
   * Tracks the persisted user background URL so the MutationObserver below
   * can re-assert it without an async re-read in the observer callback.
   */
  private cachedUserBg: string | null = null;

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

      await this.reassertUserBackground();
      this.watchBackgroundImageClass();
      this.observeBackgroundImageClass();
      this.syncBackgroundImageClass();

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

  /**
   * Read the persisted user-uploaded background image and inline-paint the
   * body. Idempotent — setting the same styles twice is a no-op. Uses the
   * page-local Themeing's SettingsAPI rather than reading from
   * window.parent so this works in iframes whose parent context may not
   * expose host APIs (e.g. settings iframe vs. host shell).
   */
  private async reassertUserBackground(): Promise<void> {
    try {
      const userBg = await this.theming.settings.getItem<string>(
        "theme:user-background-image",
      );
      this.cachedUserBg =
        userBg && typeof userBg === "string" ? userBg : null;
      if (this.cachedUserBg) {
        document.body.style.backgroundImage = `url("${this.cachedUserBg}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundRepeat = "no-repeat";
        document.body.style.backgroundAttachment = "scroll";
        document.documentElement.classList.add("has-background-image");
      }
    } catch (err) {
      console.warn(
        `[${window.location.pathname}] reassertUserBackground failed:`,
        err,
      );
    }
  }

  /**
   * Watch <html>'s class attribute. If anything strips
   * .has-background-image while we have a cached user upload, put it back
   * immediately and re-paint the body inline styles (they may also have
   * been cleared by the same code that removed the class — typically
   * Themeing.setBackgroundImage()'s no-image branch firing from a stale
   * read or a sibling Themeing instance losing the race).
   *
   * Synchronous re-assert inside the observer callback wins the next paint
   * frame regardless of which async writer fired.
   */
  private watchBackgroundImageClass(): void {
    const html = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      if (!this.cachedUserBg) return;
      for (const m of mutations) {
        if (m.attributeName !== "class") continue;
        if (!html.classList.contains("has-background-image")) {
          html.classList.add("has-background-image");
          document.body.style.backgroundImage = `url("${this.cachedUserBg}")`;
          document.body.style.backgroundSize = "cover";
          document.body.style.backgroundPosition = "center";
          document.body.style.backgroundRepeat = "no-repeat";
          document.body.style.backgroundAttachment = "scroll";
        }
      }
    });
    observer.observe(html, {
      attributes: true,
      attributeFilter: ["class"],
    });
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
      await this.reassertUserBackground();
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

  private syncBackgroundImageClass(): void {
    // ★ THE ROOT CAUSE OF THE COLD-LOAD WALLPAPER BUG ★
    try {
      const parentEl = window.parent.document.documentElement;
      if (parentEl.classList.contains("has-background-image")) {
        document.documentElement.classList.add("has-background-image");
      }
      // No else branch. Removing the class is a local decision made by
      // setBackgroundImage()'s no-image branch (with its own race guard).
    } catch (err) {
      // cross-origin parent — skip
    }
  }

  private observeBackgroundImageClass(): void {
    try {
      const parentEl = window.parent.document.documentElement;
      const observer = new MutationObserver(() => this.syncBackgroundImageClass());
      observer.observe(parentEl, { attributes: true, attributeFilter: ["class"] });
    } catch (err) { /* expected for cross-origin frames */ }
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
