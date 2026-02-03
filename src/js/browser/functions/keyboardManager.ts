import { KeyboardInterface } from "./types";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { DevTools } from "./devTools";
import { KeybindManager } from "./keybinds";

export class KeyboardManager implements KeyboardInterface {
  private tabs: any;
  private devTools: DevTools;
  private keybindManager: KeybindManager;
  public captureMode: boolean = false;

  constructor(
    tabs: any,
    settings: SettingsAPI,
    _events: EventSystem,
    devTools: DevTools,
  ) {
    this.tabs = tabs;
    this.devTools = devTools;
    this.keybindManager = new KeybindManager(settings);
  }

  async init(): Promise<void> {
    await this.keybindManager.loadKeybinds();
    window.addEventListener(
      "keydown",
      async (event) => {
        await this.handleKeyDown(event);
      },
      true,
    );

    window.addEventListener("message", (event) => {
      if (event.data?.type === "keybinds-updated") {
        this.reloadKeybinds();
      }
    });
  }

  async reloadKeybinds(): Promise<void> {
    await this.keybindManager.loadKeybinds();
    console.log("[KeyboardManager] Keybinds reloaded");
  }

  async handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (this.captureMode) return;

    const action = this.keybindManager.findMatchingAction(event);

    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    switch (action) {
      case "newTab":
        await this.tabs.createTab("ddx://newtab/");
        break;
      case "closeTab":
        await this.tabs.closeCurrentTab();
        break;
      case "reopenTab":
        await this.handleReopenTab();
        break;
      case "duplicateTab":
        await this.handleDuplicateTab();
        break;
      case "nextTab":
        this.tabs.switchToNextTab();
        break;
      case "prevTab":
        this.tabs.switchToPreviousTab();
        break;
      case "pinTab":
        this.handlePinTab();
        break;
      case "goBack":
        this.handleNavigation("back");
        break;
      case "goForward":
        this.handleNavigation("forward");
        break;
      case "reload":
        this.handleReload(false);
        break;
      case "hardReload":
        this.handleReload(true);
        break;
      case "focusAddressBar":
        this.handleFocusAddressBar();
        break;
      case "goHome":
        await this.handleGoHome();
        break;
      case "inspect":
        await this.handleInspect();
        break;
      case "viewSource":
        this.handleViewSource();
        break;
      case "zoomIn":
        this.handleZoom(0.1);
        break;
      case "zoomOut":
        this.handleZoom(-0.1);
        break;
      case "zoomReset":
        this.handleZoomReset();
        break;
      case "fullscreen":
        this.handleFullscreen();
        break;
      case "find":
        this.handleFind();
        break;
      case "findNext":
        this.handleFindNext();
        break;
      case "findPrev":
        this.handleFindPrev();
        break;
      case "openSettings":
        await this.tabs.createTab("ddx://settings/");
        break;
      case "openHistory":
        await this.tabs.createTab("ddx://history/");
        break;
      case "openBookmarks":
        await this.tabs.createTab("ddx://bookmarks/");
        break;
      case "addBookmark":
        this.handleAddBookmark();
        break;
      case "createGroup":
        this.handleCreateGroup();
        break;
      case "ungroupTab":
        this.handleUngroupTab();
        break;
    }
  }

  private getActiveIframe(): HTMLIFrameElement | null {
    return document.querySelector("iframe.active") as HTMLIFrameElement;
  }

  private async handleReopenTab(): Promise<void> {
    console.log("Reopen tab functionality not yet implemented");
  }

  private async handleDuplicateTab(): Promise<void> {
    const activeTab = this.tabs.tabs.find((tab: any) =>
      tab.tab.classList.contains("active"),
    );
    if (activeTab?.url) {
      await this.tabs.createTab(activeTab.url);
    }
  }

  private handlePinTab(): void {
    const activeTab = this.tabs.tabs.find((tab: any) =>
      tab.tab.classList.contains("active"),
    );
    if (activeTab) {
      this.tabs.pinManager.togglePinTab(activeTab.id);
    }
  }

  private handleNavigation(direction: "back" | "forward"): void {
    const activeIframe = this.getActiveIframe();
    if (activeIframe) {
      try {
        if (direction === "back") {
          activeIframe?.contentWindow?.history.back();
        } else {
          activeIframe?.contentWindow?.history.forward();
        }
      } catch (error) {
        console.warn("Could not perform keyboard navigation:", error);
      }
    }
  }

  private handleReload(hard: boolean): void {
    const activeIframe = this.getActiveIframe();
    if (activeIframe) {
      try {
        if (hard) {
          activeIframe?.contentWindow?.location.reload();
        } else {
          activeIframe?.contentWindow?.location.reload();
        }
      } catch (error) {
        console.warn("Could not reload via keyboard shortcut:", error);
      }
    }
  }

  private handleFocusAddressBar(): void {
    const addressBar = document.querySelector(
      "input[data-id='search']",
    ) as HTMLInputElement;
    if (addressBar) {
      addressBar.focus();
      addressBar.select();
    }
  }

  private async handleGoHome(): Promise<void> {
    await this.tabs.createTab("ddx://newtab/");
  }

  private async handleInspect(): Promise<void> {
    const settings = new SettingsAPI();
    const devtoolsPreference = (await settings.getItem("devtools")) || "eruda";

    if (devtoolsPreference === "eruda") {
      this.devTools.inspectElement();
    } else {
      this.tabs.toggleChiiDevTools();
    }
  }

  private handleViewSource(): void {
    const activeTab = this.tabs.tabs.find((tab: any) =>
      tab.tab.classList.contains("active"),
    );
    if (activeTab?.url) {
      this.tabs.createTab(`view-source:${activeTab.url}`);
    }
  }

  private handleZoom(delta: number): void {
    console.log(
      `Zoom ${delta > 0 ? "in" : "out"} functionality not yet implemented`,
    );
  }

  private handleZoomReset(): void {
    console.log("Zoom reset functionality not yet implemented");
  }

  private handleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private handleFind(): void {
    console.log("Find in page functionality not yet implemented");
  }

  private handleFindNext(): void {
    console.log("Find next functionality not yet implemented");
  }

  private handleFindPrev(): void {
    console.log("Find previous functionality not yet implemented");
  }

  private handleAddBookmark(): void {
    console.log("Add bookmark functionality not yet implemented");
  }

  private handleCreateGroup(): void {
    console.log("Create tab group functionality not yet implemented");
  }

  private handleUngroupTab(): void {
    console.log("Ungroup tab functionality not yet implemented");
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
    console.log("Keybinds are now managed through Settings > Keybinds");
  }
}
