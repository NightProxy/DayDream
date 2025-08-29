import { KeyboardInterface } from "./types";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { DevTools } from "./devTools";

export class KeyboardManager implements KeyboardInterface {
  private tabs: any;
  private devTools: DevTools;

  constructor(
    tabs: any,
    _settings: SettingsAPI,
    _events: EventSystem,
    devTools: DevTools,
  ) {
    this.tabs = tabs;
    this.devTools = devTools;
  }

  init(): void {
    window.addEventListener("keydown", async (event) => {
      await this.handleKeyDown(event);
    });
  }

  private async handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (this.isNewTabShortcut(event)) {
      await this.handleNewTab(event);
    } else if (this.isCloseTabShortcut(event)) {
      this.handleCloseTab(event);
    } else if (this.isNavigationShortcut(event)) {
      this.handleNavigation(event);
    } else if (this.isReloadShortcut(event)) {
      this.handleReload(event);
    } else if (this.isInspectElementShortcut(event)) {
      this.handleInspectElement(event);
    }
  }

  private isNewTabShortcut(event: KeyboardEvent): boolean {
    return (
      (event.altKey && event.key === "t") ||
      (event.ctrlKey && event.key === "t")
    );
  }

  private async handleNewTab(event: KeyboardEvent): Promise<void> {
    if (event.ctrlKey && event.key === "t") {
      event.preventDefault();
    }
    await this.tabs.createTab("ddx://newtab/");
  }

  private isCloseTabShortcut(event: KeyboardEvent): boolean {
    return event.altKey && event.key === "w";
  }

  private handleCloseTab(_event: KeyboardEvent): void {
    this.tabs.closeCurrentTab();
  }

  private isNavigationShortcut(event: KeyboardEvent): boolean {
    return (
      event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")
    );
  }

  private handleNavigation(event: KeyboardEvent): void {
    const activeIframe = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (activeIframe) {
      if (event.key === "ArrowLeft") {
        activeIframe?.contentWindow?.history.back();
      } else if (event.key === "ArrowRight") {
        activeIframe?.contentWindow?.history.forward();
      }
    }
  }

  private isReloadShortcut(event: KeyboardEvent): boolean {
    return (
      (event.altKey && event.key === "r") ||
      (event.altKey && event.keyCode === 116)
    );
  }

  private handleReload(_event: KeyboardEvent): void {
    const activeIframe = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (activeIframe) {
      activeIframe?.contentWindow?.location.reload();
    }
  }

  private isInspectElementShortcut(event: KeyboardEvent): boolean {
    return event.altKey && event.shiftKey && event.key === "I";
  }

  private handleInspectElement(event: KeyboardEvent): void {
    event.preventDefault();

    const activeIframe = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (activeIframe) {
      this.devTools.inspectElement();
    }
  }

  addKeyboardShortcut(
    combination: {
      alt?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      key: string;
    },
    callback: (event: KeyboardEvent) => void | Promise<void>,
  ): void {
    window.addEventListener("keydown", async (event) => {
      const matches =
        (!combination.alt || event.altKey) &&
        (!combination.ctrl || event.ctrlKey) &&
        (!combination.shift || event.shiftKey) &&
        event.key === combination.key;

      if (matches) {
        await callback(event);
      }
    });
  }

  async updateShortcutsFromSettings(): Promise<void> {
    try {
      console.log("Keyboard settings feature coming soon");
    } catch (error) {
      console.warn("Failed to load keyboard settings:", error);
    }
  }
}
