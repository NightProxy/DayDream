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

      // ORDER MATTERS — reassertUserBackground MUST run before any class
      // observer or parent-mirror call. It populates `cachedUserBg`,
      // which the MutationObserver in watchBackgroundImageClass uses to
      // decide whether to defensively re-add the class after a strip.
      // If we ran an observer first and a strip happened before the
      // cache was populated, the observer would see `cachedUserBg = null`
      // and let the strip stand — exactly the cold-load bug that left
      // every internal page black until manual toggle.
      //
      // Sequence:
      //   1. reassertUserBackground — read userBg, paint body inline,
      //      add class, populate cache.
      //   2. watchBackgroundImageClass — start local <html> observer
      //      with cache already set, so first defensive re-add works.
      //   3. observeBackgroundImageClass + syncBackgroundImageClass —
      //      parent-mirror is now safe (only ADDs class per fix to
      //      syncBackgroundImageClass below; never removes).
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
        // Same paint shape as Themeing.setBackgroundImage()'s /internal/
        // branch so anything else reading our inline styles sees the
        // canonical layout.
        document.body.style.backgroundImage = `url("${this.cachedUserBg}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundRepeat = "no-repeat";
        // scroll, not fixed — Chromium iframe fixed-bg repaint bug. See
        // matching note in theming.ts:722 and internal.scss:61.
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
      // Keep the observer's cached value fresh — user just uploaded,
      // removed, or replaced the wallpaper. Without this, watchBackground
      // ImageClass() would either re-assert a stale URL after removal or
      // refuse to re-assert after a fresh upload (cachedUserBg = null
      // means "no defensive re-add").
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
    //
    // Originally this function MIRRORED the parent's class state — if the
    // parent had `.has-background-image`, the iframe got it; if not, the
    // iframe lost it. This was wrong by design: the host shell at "/" is
    // NOT an /internal/ page, and `theming.ts:724` gates the class-add to
    // /internal/ pathnames only. So the host's <html> NEVER receives the
    // class. So `parentEl.classList.contains("has-background-image")` was
    // ALWAYS false. So every iframe init unconditionally STRIPPED the
    // class via the else branch — typically just after `theming.init()`
    // had successfully added it — leaving every internal page black on
    // cold load until the user toggled the bg setting (which triggered a
    // fresh paint via setBackgroundImage that won the race).
    //
    // Symptom this caused: wallpaper flashed for ~50ms then disappeared
    // on every cold load of every internal page (newtab, history,
    // settings, downloads, etc.). The previous fix rounds all guarded
    // setBackgroundImage's remove branch — which was the wrong path.
    // This function bypasses setBackgroundImage entirely and pokes
    // classList.remove directly. No guards, no events, no awaiting.
    //
    // The fix: never mirror REMOVAL. The iframe's own InternalPageTheme
    // (via setBackgroundImage, which now has its own stillHasUserBg
    // guard) is the only authority for removing its own class. The
    // parent-mirror only exists so that if the host eventually toggles
    // its OWN class (e.g. for some future host-shell wallpaper feature),
    // it can propagate ADDs to iframes. Removals stay local.
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
