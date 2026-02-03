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

    if (!tab.groupId && !isPinned) {
      menuItems.push(
        this.tabs.ui.createElement(
          "button",
          {
            class:
              "flex items-start gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
            onclick: () => {
              this.tabs.groupManager.createGroupWithTab(tabId);
              this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
            },
          },
          [
            this.tabs.ui.createElement(
              "i",
              {
                "data-lucide": "folder-plus",
                class: "h-4 w-4",
              },
              [],
            ),
            this.tabs.ui.createElement("span", {}, ["Add to New Group"]),
          ],
        ),
      );

      if (this.tabs.groups.length > 0) {
        const groupSubmenu = this.tabs.ui.createElement(
          "div",
          { class: "relative group" },
          [
            this.tabs.ui.createElement(
              "button",
              {
                class:
                  "flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
              },
              [
                this.tabs.ui.createElement(
                  "div",
                  { class: "flex items-center gap-3" },
                  [
                    this.tabs.ui.createElement(
                      "i",
                      {
                        "data-lucide": "folder",
                        class: "h-4 w-4",
                      },
                      [],
                    ),
                    this.tabs.ui.createElement("span", {}, ["Add to Group"]),
                  ],
                ),
                this.tabs.ui.createElement(
                  "i",
                  {
                    "data-lucide": "chevron-right",
                    class: "h-3 w-3",
                  },
                  [],
                ),
              ],
            ),
            this.tabs.ui.createElement(
              "div",
              {
                class:
                  "absolute left-full top-0 ml-1 min-w-48 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50",
              },
              this.tabs.groups.map((group: any) =>
                this.tabs.ui.createElement(
                  "button",
                  {
                    class:
                      "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm",
                    onclick: () => {
                      this.tabs.groupManager.addTabToGroup(tabId, group.id);
                      this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
                    },
                  },
                  [
                    this.tabs.ui.createElement("span", {
                      class: "w-3 h-3 rounded-full",
                      style: `background-color: ${group.color};`,
                    }),
                    this.tabs.ui.createElement("span", {}, [group.name]),
                  ],
                ),
              ),
            ),
          ],
        );
        menuItems.push(groupSubmenu);
      }
    } else if (tab.groupId) {
      menuItems.push(
        this.tabs.ui.createElement("div", {
          class: "h-px bg-[var(--white-08)] my-1",
        }),
      );

      const currentGroup = this.tabs.groups.find(
        (g: any) => g.id === tab.groupId,
      );

      menuItems.push(
        this.tabs.ui.createElement(
          "button",
          {
            class:
              "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
            onclick: () => {
              this.tabs.groupManager.removeTabFromGroup(tabId);
              this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
            },
          },
          [
            this.tabs.ui.createElement(
              "i",
              {
                "data-lucide": "folder-x",
                class: "h-4 w-4",
              },
              [],
            ),
            this.tabs.ui.createElement("span", {}, [
              `Remove from ${currentGroup?.name || "Group"}`,
            ]),
          ],
        ),
      );

      const otherGroups = this.tabs.groups.filter(
        (g: any) => g.id !== tab.groupId,
      );
      if (otherGroups.length > 0) {
        const moveToGroupSubmenu = this.tabs.ui.createElement(
          "div",
          { class: "relative group" },
          [
            this.tabs.ui.createElement(
              "button",
              {
                class:
                  "flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
              },
              [
                this.tabs.ui.createElement(
                  "div",
                  { class: "flex items-center gap-3" },
                  [
                    this.tabs.ui.createElement(
                      "i",
                      {
                        "data-lucide": "folder-input",
                        class: "h-4 w-4",
                      },
                      [],
                    ),
                    this.tabs.ui.createElement("span", {}, ["Move to Group"]),
                  ],
                ),
                this.tabs.ui.createElement(
                  "i",
                  {
                    "data-lucide": "chevron-right",
                    class: "h-3 w-3",
                  },
                  [],
                ),
              ],
            ),
            this.tabs.ui.createElement(
              "div",
              {
                class:
                  "absolute left-full top-0 ml-1 min-w-48 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50",
              },
              otherGroups.map((group: any) =>
                this.tabs.ui.createElement(
                  "button",
                  {
                    class:
                      "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm",
                    onclick: () => {
                      this.tabs.groupManager.addTabToGroup(tabId, group.id);
                      this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
                    },
                  },
                  [
                    this.tabs.ui.createElement("span", {
                      class: "w-3 h-3 rounded-full",
                      style: `background-color: ${group.color};`,
                    }),
                    this.tabs.ui.createElement("span", {}, [group.name]),
                  ],
                ),
              ),
            ),
          ],
        );
        menuItems.push(moveToGroupSubmenu);
      }

      if (currentGroup) {
        menuItems.push(
          this.tabs.ui.createElement(
            "button",
            {
              class:
                "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
              onclick: () => {
                this.tabs.groupManager.renameGroup(currentGroup.id);
                this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
              },
            },
            [
              this.tabs.ui.createElement(
                "i",
                {
                  "data-lucide": "edit-3",
                  class: "h-4 w-4",
                },
                [],
              ),
              this.tabs.ui.createElement("span", {}, ["Rename Group"]),
            ],
          ),
        );

        const colorSubmenu = this.tabs.ui.createElement(
          "div",
          { class: "relative group" },
          [
            this.tabs.ui.createElement(
              "button",
              {
                class:
                  "flex items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
              },
              [
                this.tabs.ui.createElement(
                  "div",
                  { class: "flex items-center gap-3" },
                  [
                    this.tabs.ui.createElement(
                      "i",
                      {
                        "data-lucide": "palette",
                        class: "h-4 w-4",
                      },
                      [],
                    ),
                    this.tabs.ui.createElement("span", {}, ["Change Color"]),
                  ],
                ),
                this.tabs.ui.createElement(
                  "i",
                  {
                    "data-lucide": "chevron-right",
                    class: "h-3 w-3",
                  },
                  [],
                ),
              ],
            ),
            this.tabs.ui.createElement(
              "div",
              {
                class:
                  "absolute left-full top-0 ml-1 min-w-32 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50",
              },
              [
                "#EF4444",
                "#F97316",
                "#EAB308",
                "#22C55E",
                "#06B6D4",
                "#3B82F6",
                "#8B5CF6",
                "#EC4899",
              ].map((color) =>
                this.tabs.ui.createElement(
                  "button",
                  {
                    class:
                      "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left",
                    onclick: () => {
                      this.tabs.groupManager.changeGroupColor(
                        currentGroup.id,
                        color,
                      );
                      this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
                    },
                  },
                  [
                    this.tabs.ui.createElement("span", {
                      class:
                        "w-4 h-4 rounded-full border border-[var(--white-08)]",
                      style: `background-color: ${color};`,
                    }),
                    this.tabs.ui.createElement("span", { class: "text-xs" }, [
                      color.toUpperCase(),
                    ]),
                  ],
                ),
              ),
            ),
          ],
        );
        menuItems.push(colorSubmenu);

        menuItems.push(
          this.tabs.ui.createElement(
            "button",
            {
              class:
                "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
              onclick: () => {
                this.tabs.groupManager.toggleGroup(currentGroup.id);
                this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
              },
            },
            [
              this.tabs.ui.createElement(
                "i",
                {
                  "data-lucide": currentGroup.isCollapsed
                    ? "folder-open"
                    : "folder-closed",
                  class: "h-4 w-4",
                },
                [],
              ),
              this.tabs.ui.createElement("span", {}, [
                currentGroup.isCollapsed ? "Expand Group" : "Collapse Group",
              ]),
            ],
          ),
        );

        menuItems.push(
          this.tabs.ui.createElement(
            "button",
            {
              class:
                "flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md",
              onclick: () => {
                if (confirm(`Close all tabs in "${currentGroup.name}"?`)) {
                  this.tabs.closeAllTabsInGroup(currentGroup.id);
                }
                this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
              },
            },
            [
              this.tabs.ui.createElement(
                "i",
                {
                  "data-lucide": "folder-x",
                  class: "h-4 w-4",
                },
                [],
              ),
              this.tabs.ui.createElement("span", {}, [
                "Close All Tabs in Group",
              ]),
            ],
          ),
        );

        menuItems.push(
          this.tabs.ui.createElement(
            "button",
            {
              class:
                "flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md",
              onclick: () => {
                this.tabs.groupManager.ungroupAllTabs(currentGroup.id);
                this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
              },
            },
            [
              this.tabs.ui.createElement(
                "i",
                {
                  "data-lucide": "folder-open",
                  class: "h-4 w-4",
                },
                [],
              ),
              this.tabs.ui.createElement("span", {}, ["Ungroup All Tabs"]),
            ],
          ),
        );

        menuItems.push(
          this.tabs.ui.createElement(
            "button",
            {
              class:
                "flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md",
              onclick: () => {
                this.tabs.groupManager.deleteGroup(currentGroup.id);
                this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
              },
            },
            [
              this.tabs.ui.createElement(
                "i",
                {
                  "data-lucide": "trash-2",
                  class: "h-4 w-4",
                },
                [],
              ),
              this.tabs.ui.createElement("span", {}, ["Delete Group"]),
            ],
          ),
        );
      }
    }

    menuItems.push(
      this.tabs.ui.createElement("div", {
        class: "h-px bg-[var(--white-08)] my-1",
      }),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            this.tabs.duplicateTab(tabId);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "copy",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Duplicate Tab"]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            this.tabs.refreshTab(tabId);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "refresh-cw",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Refresh Tab"]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            this.tabs.closeTabsToRight(tabId);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "arrow-right",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Close Tabs to the Right"]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            const tabElement = document.getElementById(tabId);
            let title = tab.url;

            if (tabElement) {
              const titleEl = tabElement.querySelector(
                ".tab-title, [data-tab-title]",
              );
              if (titleEl?.textContent) {
                title = titleEl.textContent.trim();
              } else if (tab.iframe?.contentDocument?.title) {
                title = tab.iframe.contentDocument.title;
              } else {
                try {
                  const url = new URL(tab.url);
                  title = url.hostname || tab.url;
                } catch {
                  title = tab.url;
                }
              }
            }

            // Use bookmarkUI to properly decode the URL before bookmarking
            this.tabs.bookmarkUI.addBookmarkFromProxiedUrl(tab.url, title);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "bookmark-plus",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Bookmark Tab"]),
        ],
      ),
    );

    menuItems.push(
      this.tabs.ui.createElement("div", {
        class: "h-px bg-[var(--white-08)] my-1",
      }),
    );

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            this.tabs.closeTabById(tabId);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "x",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Close Tab"]),
        ],
      ),
    );

    const menu = this.tabs.ui.createElement(
      "div",
      {
        class:
          "fixed z-50 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 min-w-48",
        style: "backdrop-filter: blur(8px);",
      },
      menuItems,
    );

    this.initializeLucideIcons(menu);

    this.tabs.nightmarePlugins.rightclickmenu.attachTo(tabElement, () => {
      return menu;
    });
  };

  private initializeLucideIcons(container: HTMLElement) {
    if (typeof window !== "undefined" && (window as any).lucide) {
      try {
        const icons = container.querySelectorAll("[data-lucide]");
        if (icons.length > 0) {
          (window as any).lucide.createIcons({
            nameAttr: "data-lucide",
            icons: (window as any).lucide.icons,
          });
        }
      } catch (error) {
        console.warn("Failed to initialize Lucide icons:", error);
      }
    }
  }
}
