import type { TabsInterface } from "./types";

export class TabContextMenu {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
    const tab = this.tabs.tabs.find((t) => t.id === tabId);
    if (!tab) return this.tabs.ui.createElement("div");

    const menuItems = [];

    const isPinned = this.tabs.pinManager.isPinned(tabId);
    menuItems.push(
      this.tabs.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.tabs.pinManager.togglePinTab(tabId),
        },
        [
          this.tabs.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            [isPinned ? "push_pin" : "push_pin"],
          ),
          this.tabs.ui.createElement("span", { class: "menu-label" }, [
            isPinned ? "Unpin Tab" : "Pin Tab",
          ]),
        ],
      ),
    );

    if (!tab.groupId && !isPinned) {
      menuItems.push(
        this.tabs.ui.createElement(
          "div",
          {
            class: "menu-item",
            onclick: () => this.tabs.groupManager.createGroupWithTab(tabId),
          },
          [
            this.tabs.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["folder_open"],
            ),
            this.tabs.ui.createElement("span", { class: "menu-label" }, [
              "Add to New Group",
            ]),
          ],
        ),
      );

      if (this.tabs.groups.length > 0) {
        this.tabs.groups.forEach((group) => {
          menuItems.push(
            this.tabs.ui.createElement(
              "div",
              {
                class: "menu-item",
                onclick: () =>
                  this.tabs.groupManager.addTabToGroup(tabId, group.id),
              },
              [
                this.tabs.ui.createElement("span", {
                  class: "group-color-indicator",
                  style: `background-color: ${group.color}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 8px;`,
                }),
                this.tabs.ui.createElement("span", { class: "menu-label" }, [
                  `Add to ${group.name}`,
                ]),
              ],
            ),
          );
        });
      }
    } else if (tab.groupId) {
      menuItems.push(
        this.tabs.ui.createElement(
          "div",
          {
            class: "menu-item",
            onclick: () => this.tabs.groupManager.removeTabFromGroup(tabId),
          },
          [
            this.tabs.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["folder_off"],
            ),
            this.tabs.ui.createElement("span", { class: "menu-label" }, [
              "Remove from Group",
            ]),
          ],
        ),
      );
    }

    menuItems.push(
      this.tabs.ui.createElement("div", { class: "menu-separator" }),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.tabs.duplicateTab(tabId),
        },
        [
          this.tabs.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["content_copy"],
          ),
          this.tabs.ui.createElement("span", { class: "menu-label" }, [
            "Duplicate Tab",
          ]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.tabs.refreshTab(tabId),
        },
        [
          this.tabs.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["refresh"],
          ),
          this.tabs.ui.createElement("span", { class: "menu-label" }, [
            "Refresh Tab",
          ]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.tabs.closeTabsToRight(tabId),
        },
        [
          this.tabs.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["call_made"],
          ),
          this.tabs.ui.createElement("span", { class: "menu-label" }, [
            "Close Tabs to the Right",
          ]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement("div", { class: "menu-separator" }),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.tabs.closeTabById(tabId),
        },
        [
          this.tabs.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["close"],
          ),
          this.tabs.ui.createElement("span", { class: "menu-label" }, [
            "Close Tab",
          ]),
        ],
      ),
    );

    const menu = this.tabs.ui.createElement(
      "div",
      { class: "context-menu-content" },
      menuItems,
    );

    this.tabs.nightmarePlugins.rightclickmenu.attachTo(tabElement, () => {
      return menu;
    });
  };
}
