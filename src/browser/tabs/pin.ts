import { Logger } from "@apis/logging";

export class TabPinManager {
  private tabs: any;
  private logger: Logger;

  constructor(tabs: any) {
    this.tabs = tabs;
    this.logger = new Logger();
  }

  togglePinTab(tabId: string) {
    const tabInfo = this.tabs.tabs.find((t: any) => t.id === tabId);
    if (!tabInfo) return;

    const currentState = this.tabs.ui.getState(tabId);
    const newState = currentState === "pinned" ? "normal" : "pinned";
    this.tabs.ui.setState(tabId, newState);

    const tabElement = document.getElementById(tabId);
    if (newState === "pinned") {
      tabElement?.classList.add("pinned");
      const tabIndex = this.tabs.tabs.findIndex((t: any) => t.id === tabId);
      if (tabIndex !== -1) {
        const [pinnedTab] = this.tabs.tabs.splice(tabIndex, 1);
        const lastPinnedIndex = this.tabs.tabs.findIndex(
          (t: any) => this.tabs.ui.getState(t.id) !== "pinned",
        );
        this.tabs.tabs.splice(
          lastPinnedIndex === -1 ? this.tabs.tabs.length : lastPinnedIndex,
          0,
          pinnedTab,
        );
      }
    } else {
      tabElement?.classList.remove("pinned");
    }

    this.tabs.layoutTabs();
    this.logger.createLog(
      `${newState === "pinned" ? "Pinned" : "Unpinned"} tab: ${tabId}`,
    );
  }

  isPinned(tabId: string): boolean {
    return this.tabs.ui.getState(tabId) === "pinned";
  }

  get pinnedTabEls() {
    return Array.prototype.slice.call(
      this.tabs.el.querySelectorAll(".tab.pinnned"),
    );
  }

  get unpinnedTabEls() {
    return Array.prototype.slice.call(
      this.tabs.el.querySelectorAll(".tab:not(.tab.pinned)"),
    );
  }
}
