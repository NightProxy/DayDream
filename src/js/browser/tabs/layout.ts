import type { TabsInterface } from "./types";
import { createIcons, icons } from "lucide";

export class TabLayout {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  get tabContentWidths() {
    const numberOfTabs = this.tabs.ui.queryComponentAll(
      "tab",
      this.tabs.el,
    ).length;
    const tabsContentElement = this.tabs.el.querySelector(".tabs-content");
    if (!tabsContentElement) {
      console.warn("TabLayout: .tabs-content element not found");
      return [];
    }
    const tabsContentWidth = tabsContentElement.clientWidth;
    const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * 1;
    const targetWidth =
      (tabsContentWidth - 2 * 9 + tabsCumulativeOverlappedWidth) / numberOfTabs;
    const clampedTargetWidth = Math.max(24, Math.min(240, targetWidth));
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth);
    const totalTabsWidthUsingTarget =
      flooredClampedTargetWidth * numberOfTabs +
      2 * 9 -
      tabsCumulativeOverlappedWidth;
    const totalExtraWidthDueToFlooring =
      tabsContentWidth - totalTabsWidthUsingTarget;

    const widths = [];
    let extraWidthRemaining = totalExtraWidthDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth =
        flooredClampedTargetWidth < 240 && extraWidthRemaining > 0 ? 1 : 0;
      widths.push(flooredClampedTargetWidth + extraWidth);
      if (extraWidth > 0) {
        extraWidthRemaining -= 1;
      }
    }

    return widths;
  }

  get tabContentPositions() {
    const positions: number[] = [];
    const tabContentWidths = this.tabContentWidths;

    let position = 9;
    tabContentWidths.forEach((width, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += width;
    });

    return positions;
  }

  get tabPositions() {
    const positions: number[] = [];

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  get tabContentHeights() {
    const numberOfTabs = this.tabs.ui.queryComponentAll(
      "tab",
      this.tabs.el,
    ).length;
    const tabsContentElement = this.tabs.el.querySelector(".tabs-content");
    if (!tabsContentElement) {
      console.warn("TabLayout: .tabs-content element not found");
      return [];
    }
    const tabsContentHeight = tabsContentElement.clientHeight;
    const tabsCumulativeOverlappedHeight = (numberOfTabs - 1) * 1;
    const targetHeight =
      (tabsContentHeight + tabsCumulativeOverlappedHeight) / numberOfTabs;
    const clampedTargetHeight = Math.max(24, Math.min(36, targetHeight));
    const flooredClampedTargetHeight = Math.floor(clampedTargetHeight);
    const totalTabsHeightUsingTarget =
      flooredClampedTargetHeight * numberOfTabs -
      tabsCumulativeOverlappedHeight;
    const totalExtraHeightDueToFlooring =
      tabsContentHeight - totalTabsHeightUsingTarget;

    const heights = [];
    let extraHeightRemaining = totalExtraHeightDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraHeight =
        flooredClampedTargetHeight < 36 && extraHeightRemaining > 0 ? 1 : 0;
      heights.push(flooredClampedTargetHeight + extraHeight);
      if (extraHeight > 0) {
        extraHeightRemaining -= 1;
      }
    }

    return heights;
  }

  get tabContentPositionsY() {
    const positions: number[] = [];
    const tabContentHeights = this.tabContentHeights;

    let position = 9;
    tabContentHeights.forEach((height, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += height;
    });

    return positions;
  }

  get tabPositionsY() {
    const positions: number[] = [];

    this.tabContentPositionsY.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  popGlow = (el: HTMLElement) => {
    el.style.transition = ".4s ease-out";
  };

  renderGroupHeaders = (): void => {
    const existingHeaders = this.tabs.el.querySelectorAll(".tab-group-header");
    existingHeaders.forEach((header) => header.remove());

    const groupedTabs = new Map<string, any[]>();
    let ungroupedTabs: any[] = [];

    this.tabs.tabs.forEach((tab) => {
      if (tab.groupId) {
        if (!groupedTabs.has(tab.groupId)) {
          groupedTabs.set(tab.groupId, []);
        }
        groupedTabs.get(tab.groupId)!.push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });

    groupedTabs.forEach((groupTabs, groupId) => {
      const group = this.tabs.groups.find((g: any) => g.id === groupId);
      if (!group || groupTabs.length === 0) return;

      const firstTabElement = document.getElementById(groupTabs[0].id);
      if (!firstTabElement) return;

      const groupHeader = this.tabs.ui.createElement(
        "div",
        {
          class: `tab-group-header ${group.isCollapsed ? "collapsed" : ""}`,
          "data-group-id": groupId,
          "data-tooltip": `${group.isCollapsed ? "Click to expand" : "Click to collapse"} • ${groupTabs.length} tabs • Drag to move group`,
          onclick: () => this.tabs.groupManager.toggleGroup(groupId),
          draggable: true,
        },
        [
          this.tabs.ui.createElement(
            "div",
            {
              class: "tab-group-indicator",
              style: `background-color: ${group.color};`,
            },
            [
              this.tabs.ui.createElement(
                "span",
                {
                  class: "text-xs opacity-60",
                },
                [`${groupTabs.length}`],
              ),
            ],
          ),
          this.tabs.ui.createElement("span", {}, [group.name]),
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": group.isCollapsed
                ? "chevron-right"
                : "chevron-down",
              class: "h-3 w-3 ml-1",
            },
            [],
          ),
        ],
      );

      firstTabElement.parentNode!.insertBefore(groupHeader, firstTabElement);

      this.setupGroupHeaderContextMenu(groupHeader, group);
    });
  };

  private setupGroupHeaderContextMenu = (
    headerElement: HTMLElement,
    group: any,
  ) => {
    const menuItems = [];

    menuItems.push(
      this.tabs.ui.createElement(
        "button",
        {
          class:
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            this.tabs.groupManager.renameGroup(group.id);
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
                  this.tabs.groupManager.changeGroupColor(group.id, color);
                  this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
                },
              },
              [
                this.tabs.ui.createElement("span", {
                  class: "w-4 h-4 rounded-full border border-[var(--white-08)]",
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
            this.tabs.groupManager.toggleGroup(group.id);
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": group.isCollapsed
                ? "folder-open"
                : "folder-closed",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, [
            group.isCollapsed ? "Expand Group" : "Collapse Group",
          ]),
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
            "flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            group.tabIds.forEach((tabId: string) => {
              this.tabs.selectTabById(tabId);
            });
            this.tabs.nightmarePlugins.rightclickmenu.closeMenu();
          },
        },
        [
          this.tabs.ui.createElement(
            "i",
            {
              "data-lucide": "mouse-pointer-click",
              class: "h-4 w-4",
            },
            [],
          ),
          this.tabs.ui.createElement("span", {}, ["Select All Tabs"]),
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
            group.tabIds.forEach((tabId: string) => {
              const tab = this.tabs.tabs.find((t: any) => t.id === tabId);
              if (tab) {
                const tabElement = document.getElementById(tabId);
                let title = tab.url;
                if (tabElement) {
                  const titleEl = tabElement.querySelector(
                    ".tab-title, [data-tab-title]",
                  );
                  if (titleEl?.textContent) {
                    title = titleEl.textContent.trim();
                  }
                }
                this.tabs.bookmarkManager.addBookmark(tab.url, title);
              }
            });
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
          this.tabs.ui.createElement("span", {}, ["Bookmark All Tabs"]),
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
            "flex items-center gap-3 px-4 py-2 hover:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300 transition-colors w-full text-left text-sm rounded-md",
          onclick: () => {
            if (confirm(`Ungroup all tabs from "${group.name}"?`)) {
              this.tabs.groupManager.ungroupAllTabs(group.id);
            }
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
            if (confirm(`Close all tabs in "${group.name}"?`)) {
              this.tabs.closeAllTabsInGroup(group.id);
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
          this.tabs.ui.createElement("span", {}, ["Close All Tabs"]),
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
            if (confirm(`Delete group "${group.name}" and all its tabs?`)) {
              this.tabs.groupManager.deleteGroup(group.id);
            }
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

    this.tabs.nightmarePlugins.rightclickmenu.attachTo(headerElement, () => {
      return menu;
    });
    createIcons({ icons });
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

  showDropIndicator(tabId: string) {
    this.hideDropIndicator();
    const tabElement = document.querySelector(
      `[data-tab-id="${tabId}"]`,
    ) as HTMLElement;
    if (tabElement) {
      const indicator = document.createElement("div");
      indicator.className = "drop-indicator";
      indicator.id = "drop-indicator";
      tabElement.style.position = "relative";
      tabElement.appendChild(indicator);
    }
  }

  hideDropIndicator() {
    const indicator = document.getElementById("drop-indicator");
    if (indicator) indicator.remove();
  }

  createUngroupZones(draggedGroupId: string, isFirstInGroup: boolean) {
    const tabBar = this.tabs.el.querySelector(".tabs-content");
    if (!tabBar) return;

    const group = this.tabs.groups.find((g: any) => g.id === draggedGroupId);
    if (!group) return;

    const endZone = document.createElement("div");
    endZone.id = "end-ungroup-zone";
    endZone.className = "ungroup-zone end-ungroup-zone";
    endZone.innerHTML = "<span>Ungroup</span>";

    endZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      endZone.classList.add("drag-over");
    });

    endZone.addEventListener("dragleave", () => {
      endZone.classList.remove("drag-over");
    });

    tabBar.appendChild(endZone);

    if (isFirstInGroup) {
      const startZone = document.createElement("div");
      startZone.id = "start-ungroup-zone";
      startZone.className = "ungroup-zone start-ungroup-zone";
      startZone.innerHTML = "<span>Ungroup</span>";

      startZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        startZone.classList.add("drag-over");
      });

      startZone.addEventListener("dragleave", () => {
        startZone.classList.remove("drag-over");
      });

      tabBar.insertBefore(startZone, tabBar.firstChild);
    }
  }

  removeUngroupZones() {
    ["end-ungroup-zone", "start-ungroup-zone"].forEach((id) => {
      const zone = document.getElementById(id);
      if (zone) zone.remove();
    });
  }

  showGroupIndicator(
    groupHeader: HTMLElement,
    e: DragEvent,
    isVertical = false,
  ) {
    this.hideGroupIndicator(groupHeader);
    const rect = groupHeader.getBoundingClientRect();
    const isAfter = isVertical
      ? e.clientY > rect.top + rect.height / 2
      : e.clientX > rect.left + rect.width / 2;

    const indicator = document.createElement("div");
    indicator.className = "group-indicator";
    indicator.style.cssText = isVertical
      ? `position:absolute;left:0;right:0;height:2px;background:var(--accent);z-index:1000;${isAfter ? "bottom:-1px;" : "top:-1px;"}`
      : `position:absolute;width:2px;top:0;bottom:0;background:var(--accent);z-index:1002;${isAfter ? "right:-1px;" : "left:-1px;"}`;

    groupHeader.style.position = "relative";
    groupHeader.appendChild(indicator);
  }

  hideGroupIndicator(groupHeader: HTMLElement) {
    const indicator = groupHeader.querySelector(".group-indicator");
    if (indicator) indicator.remove();
  }
}

createIcons({ icons });
