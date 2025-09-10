import { EventSystem } from "@apis/events";
import { Logger } from "@apis/logging";

export class TabDragHandler {
  private tabs: any;
  private eventsAPI: EventSystem;
  private logger: Logger;
  private draggedTab: string | null = null;
  private dragCounter: number = 0;
  private isDragging: boolean = false;
  private draggabillyDragging: any = null;
  private draggabillies: any[] = [];
  private containerDragOverHandler: ((e: DragEvent) => void) | null = null;
  private containerDropHandler: ((e: DragEvent) => void) | null = null;

  constructor(tabs: any) {
    this.tabs = tabs;
    this.eventsAPI = new EventSystem();
    this.logger = new Logger();
  }

  get tabEls() {
    return Array.prototype.slice.call(this.tabs.el.querySelectorAll(".tab"));
  }

  setupSortable() {
    const tabEls = this.tabEls;

    if (this.isDragging) {
      this.isDragging = false;
      this.tabs.el.classList.remove("tabs-is-sorting");
      if (this.draggabillyDragging) {
        this.draggabillyDragging.element.classList.remove("tab-is-dragging");
        this.draggabillyDragging.element.style.transform = "";
        this.draggabillyDragging.destroy();
        this.draggabillyDragging = null;
      }
    }

    this.draggabillies.forEach((d) => d.destroy());
    this.draggabillies = [];

    const tabsContainer = this.tabs.el;
    if (this.containerDragOverHandler) {
      tabsContainer.removeEventListener(
        "dragover",
        this.containerDragOverHandler,
      );
    }
    if (this.containerDropHandler) {
      tabsContainer.removeEventListener("drop", this.containerDropHandler);
    }

    tabEls.forEach((tabEl: HTMLElement) => {
      const tabId = tabEl.id;

      tabEl.draggable = true;
      tabEl.dataset.tabId = tabId;

      const tabData = this.tabs.tabs.find((t: any) => t.id === tabId);
      if (tabData?.groupId) {
        const group = this.tabs.groups.find(
          (g: any) => g.id === tabData.groupId,
        );
        tabEl.setAttribute("tab-group", group?.id || "");
      } else {
        tabEl.removeAttribute("tab-group");
      }

      const dragStartHandler = (e: DragEvent) =>
        this.handleEnhancedDragStart(e, tabId);
      const dragOverHandler = (e: DragEvent) =>
        this.handleEnhancedDragOver(e, tabId);
      const dragEnterHandler = (e: DragEvent) =>
        this.handleEnhancedDragEnter(e, tabId);
      const dragLeaveHandler = () => this.handleEnhancedDragLeave();
      const dropHandler = (e: DragEvent) => this.handleEnhancedDrop(e, tabId);
      const dragEndHandler = () => this.handleEnhancedDragEnd();

      tabEl.removeEventListener("dragstart", dragStartHandler);
      tabEl.removeEventListener("dragover", dragOverHandler);
      tabEl.removeEventListener("dragenter", dragEnterHandler);
      tabEl.removeEventListener("dragleave", dragLeaveHandler);
      tabEl.removeEventListener("drop", dropHandler);
      tabEl.removeEventListener("dragend", dragEndHandler);

      tabEl.addEventListener("dragstart", dragStartHandler);
      tabEl.addEventListener("dragover", dragOverHandler);
      tabEl.addEventListener("dragenter", dragEnterHandler);
      tabEl.addEventListener("dragleave", dragLeaveHandler);
      tabEl.addEventListener("drop", dropHandler);
      tabEl.addEventListener("dragend", dragEndHandler);
    });

    this.containerDragOverHandler = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    };

    this.containerDropHandler = (e: DragEvent) => {
      e.preventDefault();

      const target = e.target as HTMLElement;
      if (target.closest(".tab")) {
        return;
      }

      const dragData = e.dataTransfer?.getData("text/html");
      if (dragData && dragData.startsWith("group-")) {
        const groupId = dragData.replace("group-", "");
        this.handleGroupDropToEmptySpace(groupId, e);
        return;
      }

      if (this.draggedTab) {
        const draggedTabData = this.tabs.tabs.find(
          (t: any) => t.id === this.draggedTab,
        );
        if (draggedTabData?.groupId) {
          this.logger.createLog(
            `Ungrouping tab ${this.draggedTab} via empty space drop`,
          );
          this.tabs.groupManager.removeTabFromGroup(this.draggedTab);
        }
      }
    };

    tabsContainer.addEventListener("dragover", this.containerDragOverHandler);
    tabsContainer.addEventListener("drop", this.containerDropHandler);

    this.setupGroupHeaderDragHandlers();
    this.logger.createLog(`Setup enhanced drag system successfully`);
  }

  handleEnhancedDragStart = (e: DragEvent, tabId: string) => {
    this.draggedTab = tabId;
    this.dragCounter = 0;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/html", tabId);
    }

    const tabElement = e.target as HTMLElement;
    tabElement.classList.add("drag-ghost");

    const draggedTab = this.tabs.tabs.find((t: any) => t.id === tabId);
    if (draggedTab?.groupId) {
      this.logger.createLog(
        `Started dragging tab ${tabId} from group ${draggedTab.groupId}`,
      );
    }

    this.highlightDropZones();
    this.eventsAPI.emit("tab:dragStart", { tabId });
  };

  handleEnhancedDragOver = (e: DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }

    this.updateDropIndicator(targetTabId);

    const dragData = e.dataTransfer?.getData("text/html");
    if (dragData && dragData.startsWith("group-")) {
      return;
    }

    if (this.draggedTab && this.draggedTab !== targetTabId) {
      const draggedTab = this.tabs.tabs.find(
        (t: any) => t.id === this.draggedTab,
      );
      const targetTab = this.tabs.tabs.find((t: any) => t.id === targetTabId);
      const targetElement = document.querySelector(
        `[data-tab-id="${targetTabId}"]`,
      ) as HTMLElement;

      if (draggedTab && targetTab && targetElement) {
        document.querySelectorAll(".ungroup-indicator").forEach((el) => {
          el.classList.remove("ungroup-indicator");
        });

        const wouldUngroup = this.shouldUngroupBasedOnPosition(
          e,
          draggedTab,
          targetTab,
          targetElement,
        );

        if (wouldUngroup && draggedTab.groupId) {
          targetElement.classList.add("ungroup-indicator");
          this.logger.createLog(
            `Showing ungroup indicator for tab ${targetTabId}`,
          );
        }
      }
    }
  };

  handleEnhancedDragEnter = (e: DragEvent, tabId: string) => {
    e.preventDefault();
    this.dragCounter++;
    this.updateDropIndicator(tabId);
  };

  handleEnhancedDragLeave = () => {
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;

      setTimeout(() => {
        if (this.dragCounter === 0) {
          this.removeDropIndicator();

          document.querySelectorAll(".ungroup-indicator").forEach((el) => {
            el.classList.remove("ungroup-indicator");
          });
        }
      }, 10);
    }
  };

  handleEnhancedDrop = (e: DragEvent, targetTabId: string) => {
    e.preventDefault();
    this.dragCounter = 0;

    const dragData = e.dataTransfer?.getData("text/html");
    if (dragData && dragData.startsWith("group-")) {
      const groupId = dragData.replace("group-", "");
      this.handleGroupDropOnTab(groupId, targetTabId, e);
      return;
    }

    if (!this.draggedTab || this.draggedTab === targetTabId) {
      this.handleEnhancedDragEnd();
      return;
    }

    const draggedTab = this.tabs.tabs.find(
      (t: any) => t.id === this.draggedTab,
    );
    const targetTab = this.tabs.tabs.find((t: any) => t.id === targetTabId);

    if (!draggedTab || !targetTab) {
      this.handleEnhancedDragEnd();
      return;
    }

    if (
      this.tabs.isPinned(draggedTab.id) !== this.tabs.isPinned(targetTab.id)
    ) {
      this.handleEnhancedDragEnd();
      return;
    }

    const targetElement = document.querySelector(
      `[data-tab-id="${targetTabId}"]`,
    ) as HTMLElement;

    const hasUngroupIndicator =
      targetElement?.classList.contains("ungroup-indicator");

    const shouldUngroup = this.shouldUngroupBasedOnPosition(
      e,
      draggedTab,
      targetTab,
      targetElement,
    );

    this.logger.createLog(
      `Drop: shouldUngroup=${shouldUngroup}, hasUngroupIndicator=${hasUngroupIndicator}, draggedTab.groupId=${draggedTab.groupId}, targetTab.groupId=${targetTab.groupId}`,
    );

    const willUngroup =
      (shouldUngroup || hasUngroupIndicator) && draggedTab.groupId;

    if (willUngroup) {
      this.logger.createLog(
        `Ungrouping tab ${this.draggedTab} from group ${draggedTab.groupId}`,
      );

      const success = this.tabs.groupManager.removeTabFromGroup(
        this.draggedTab,
      );
      this.logger.createLog(`Ungroup success: ${success}`);
    } else if (draggedTab.groupId !== targetTab.groupId) {
      if (draggedTab.groupId) {
        this.tabs.groupManager.removeTabFromGroup(this.draggedTab);
      }
      if (targetTab.groupId) {
        this.tabs.groupManager.addTabToGroup(
          this.draggedTab,
          targetTab.groupId,
        );
      }

      this.moveTabToPosition(this.draggedTab, targetTabId, e);
    } else {
      this.moveTabToPosition(this.draggedTab, targetTabId, e);
    }

    this.tabs.reorderTabElements();
    this.handleEnhancedDragEnd();
    this.tabs.layoutTabs();
  };

  handleEnhancedDragEnd = () => {
    const draggedElement = document.querySelector(
      `[data-tab-id="${this.draggedTab}"]`,
    ) as HTMLElement;
    if (draggedElement) {
      draggedElement.classList.remove("drag-ghost");
      draggedElement.style.transform = "";
      draggedElement.style.position = "";
      draggedElement.style.zIndex = "";
      draggedElement.style.top = "";
      draggedElement.style.left = "";
    }

    document.querySelectorAll(".tab").forEach((tabEl: Element) => {
      const tab = tabEl as HTMLElement;
      tab.classList.remove(
        "drag-ghost",
        "tab-is-dragging",
        "tab-was-just-dragged",
      );
      if (tab.style.transform && tab.style.transform.includes("translate")) {
      } else {
        tab.style.position = "";
        tab.style.zIndex = "";
        tab.style.top = "";
        tab.style.left = "";
      }
    });

    document.querySelectorAll(".ungroup-indicator").forEach((el) => {
      el.classList.remove("ungroup-indicator");
    });

    document.querySelectorAll(".drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });

    this.hideDropZones();
    this.removeDropIndicator();

    this.draggedTab = null;
    this.dragCounter = 0;

    this.eventsAPI.emit("tab:dragEnd", null);
  };

  shouldUngroupBasedOnPosition(
    e: DragEvent,
    draggedTab: any,
    targetTab: any,
    targetElement: HTMLElement | null,
  ): boolean {
    if (!draggedTab.groupId) {
      this.logger.createLog("No ungrouping needed: dragged tab not in group");
      return false;
    }

    if (!targetTab.groupId) {
      this.logger.createLog("Ungrouping: target tab not in group");
      return true;
    }

    if (draggedTab.groupId !== targetTab.groupId) {
      this.logger.createLog("Ungrouping: different groups");
      return true;
    }

    if (!targetElement) {
      this.logger.createLog("No ungrouping: no target element");
      return false;
    }

    const rect = targetElement.getBoundingClientRect();
    const mouseX = e.clientX;

    const group = this.tabs.groups.find(
      (g: any) => g.id === draggedTab.groupId,
    );
    if (!group) {
      this.logger.createLog("No ungrouping: group not found");
      return false;
    }

    const groupTabs = this.tabs.tabs
      .map((tab: any, index: number) => ({ ...tab, index }))
      .filter((t: any) => t.groupId === group.id)
      .sort((a: any, b: any) => a.index - b.index);

    if (groupTabs.length <= 1) {
      this.logger.createLog("No ungrouping: only one tab in group");
      return false;
    }

    const isFirstTabInGroup = groupTabs[0]?.id === targetTab.id;
    const isLastTabInGroup =
      groupTabs[groupTabs.length - 1]?.id === targetTab.id;

    const tabWidth = rect.width;
    const edgeThreshold = Math.min(Math.max(tabWidth * 0.3, 50), 100);

    this.logger.createLog(
      `Drag position: mouseX=${mouseX}, rectLeft=${rect.left}, rectRight=${rect.right}, edgeThreshold=${edgeThreshold}, tabWidth=${tabWidth}, isFirst=${isFirstTabInGroup}, isLast=${isLastTabInGroup}`,
    );

    if (isFirstTabInGroup && mouseX < rect.left + edgeThreshold) {
      this.logger.createLog("UNGROUP DETECTED: left edge of first tab");
      return true;
    }
    if (isLastTabInGroup && mouseX > rect.right - edgeThreshold) {
      this.logger.createLog("UNGROUP DETECTED: right edge of last tab");
      return true;
    }

    this.logger.createLog("No ungrouping: not in edge zones");
    return false;
  }

  moveTabToPosition(draggedTabId: string, targetTabId: string, e: DragEvent) {
    const draggedIndex = this.tabs.tabs.findIndex(
      (t: any) => t.id === draggedTabId,
    );
    let targetIndex = this.tabs.tabs.findIndex(
      (t: any) => t.id === targetTabId,
    );

    const targetElement = document.querySelector(
      `[data-tab-id="${targetTabId}"]`,
    ) as HTMLElement;
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const isRightSide = e.clientX > rect.left + rect.width / 2;
      if (isRightSide) {
        targetIndex += 1;
      }
    }

    const [removed] = this.tabs.tabs.splice(draggedIndex, 1);
    if (draggedIndex < targetIndex) {
      targetIndex -= 1;
    }
    this.tabs.tabs.splice(targetIndex, 0, removed);
  }

  highlightDropZones() {
    document.body.classList.add("tab-dragging");

    const draggedTab = this.tabs.tabs.find(
      (t: any) => t.id === this.draggedTab,
    );
    if (draggedTab?.groupId) {
      this.createEndUngroupZone();
    }
  }

  hideDropZones() {
    document.body.classList.remove("tab-dragging");
    this.removeEndUngroupZone();
  }

  createEndUngroupZone() {
    this.removeEndUngroupZone();

    const tabBar = this.tabs.el.querySelector(".tabs-content");
    if (!tabBar) return;

    const draggedTab = this.tabs.tabs.find(
      (t: any) => t.id === this.draggedTab,
    );
    if (!draggedTab?.groupId) return;

    const group = this.tabs.groups.find(
      (g: any) => g.id === draggedTab.groupId,
    );
    if (!group) return;

    const ungroupZone = document.createElement("div");
    ungroupZone.id = "end-ungroup-zone";
    ungroupZone.className = "end-ungroup-zone";
    ungroupZone.innerHTML = "<span>Drop here to ungroup</span>";

    ungroupZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      ungroupZone.classList.add("drag-over");
    });

    ungroupZone.addEventListener("dragleave", () => {
      ungroupZone.classList.remove("drag-over");
    });

    ungroupZone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (this.draggedTab) {
        this.logger.createLog(
          `Dropping on end ungroup zone: ${this.draggedTab}`,
        );

        this.tabs.groupManager.removeTabFromGroup(this.draggedTab);

        const draggedIndex = this.tabs.tabs.findIndex(
          (t: any) => t.id === this.draggedTab,
        );
        if (draggedIndex !== -1) {
          const [removed] = this.tabs.tabs.splice(draggedIndex, 1);
          this.tabs.tabs.push(removed);
        }

        this.tabs.reorderTabElements();
        this.handleEnhancedDragEnd();
        this.tabs.layoutTabs();
      }
    });

    tabBar.appendChild(ungroupZone);

    const firstTab = this.tabs.tabs[0];
    if (firstTab?.groupId && firstTab.groupId === draggedTab.groupId) {
      this.createStartUngroupZone();
    }
  }

  createStartUngroupZone() {
    const tabBar = this.tabs.el.querySelector(".tabs-content");
    if (!tabBar) return;

    const startUngroupZone = document.createElement("div");
    startUngroupZone.id = "start-ungroup-zone";
    startUngroupZone.className = "start-ungroup-zone";
    startUngroupZone.innerHTML = "<span>Drop here to ungroup</span>";

    startUngroupZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      startUngroupZone.classList.add("drag-over");
    });

    startUngroupZone.addEventListener("dragleave", () => {
      startUngroupZone.classList.remove("drag-over");
    });

    startUngroupZone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (this.draggedTab) {
        this.logger.createLog(
          `Dropping on start ungroup zone: ${this.draggedTab}`,
        );

        this.tabs.groupManager.removeTabFromGroup(this.draggedTab);

        const draggedIndex = this.tabs.tabs.findIndex(
          (t: any) => t.id === this.draggedTab,
        );
        if (draggedIndex !== -1) {
          const [removed] = this.tabs.tabs.splice(draggedIndex, 1);
          this.tabs.tabs.unshift(removed);
        }

        this.tabs.reorderTabElements();
        this.handleEnhancedDragEnd();
        this.tabs.layoutTabs();
      }
    });

    tabBar.insertBefore(startUngroupZone, tabBar.firstChild);
  }

  removeEndUngroupZone() {
    const endZone = document.getElementById("end-ungroup-zone");
    if (endZone) {
      endZone.remove();
    }

    const startZone = document.getElementById("start-ungroup-zone");
    if (startZone) {
      startZone.remove();
    }
  }

  updateDropIndicator(tabId: string) {
    this.removeDropIndicator();

    if (this.draggedTab === tabId) return;

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

  removeDropIndicator() {
    const indicator = document.getElementById("drop-indicator");
    if (indicator) {
      indicator.remove();
    }
  }

  handleGroupDropToEmptySpace(groupId: string, e: DragEvent) {
    this.logger.createLog(
      `Handling group drop to empty space for group ${groupId}`,
    );

    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return;

    const groupTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId === groupId,
    );
    if (groupTabs.length === 0) return;

    const tabsContainer = this.tabs.el.querySelector(".tabs-content");
    if (!tabsContainer) return;

    const containerRect = tabsContainer.getBoundingClientRect();
    const dropPosition = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;

    const otherTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId !== groupId,
    );

    let insertIndex = 0;
    if (dropPosition > containerWidth * 0.5) {
      insertIndex = otherTabs.length;
    } else {
      insertIndex = 0;
    }

    const newTabsOrder = [
      ...otherTabs.slice(0, insertIndex),
      ...groupTabs,
      ...otherTabs.slice(insertIndex),
    ];

    this.tabs.tabs = newTabsOrder;

    this.tabs.reorderTabElements();
    this.tabs.layoutTabs();

    this.logger.createLog(
      `Successfully moved group "${group.name}" to empty space`,
    );
  }

  handleGroupDropOnTab(groupId: string, targetTabId: string, e: DragEvent) {
    this.logger.createLog(
      `Handling group drop on tab: group ${groupId} -> tab ${targetTabId}`,
    );

    const group = this.tabs.groups.find((g: any) => g.id === groupId);
    if (!group) return;

    const groupTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId === groupId,
    );
    if (groupTabs.length === 0) return;

    const targetTab = this.tabs.tabs.find((t: any) => t.id === targetTabId);
    if (!targetTab) return;

    const targetElement = document.querySelector(
      `[data-tab-id="${targetTabId}"]`,
    ) as HTMLElement;
    if (!targetElement) return;

    const rect = targetElement.getBoundingClientRect();
    const isRightSide = e.clientX > rect.left + rect.width / 2;

    const otherTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId !== groupId,
    );

    const targetIndex = otherTabs.findIndex(
      (tab: any) => tab.id === targetTabId,
    );
    const insertIndex = isRightSide ? targetIndex + 1 : targetIndex;

    const newTabsOrder = [
      ...otherTabs.slice(0, insertIndex),
      ...groupTabs,
      ...otherTabs.slice(insertIndex),
    ];

    this.tabs.tabs = newTabsOrder;

    this.tabs.reorderTabElements();
    this.tabs.layoutTabs();

    this.logger.createLog(
      `Successfully moved group "${group.name}" relative to tab ${targetTabId}`,
    );
  }

  setupGroupHeaderDragHandlers() {
    const tabsContainer = this.tabs.el.querySelector(".tabs-content");
    if (!tabsContainer) return;

    if (this.groupHeaderDragOverHandler) {
      tabsContainer.removeEventListener(
        "dragover",
        this.groupHeaderDragOverHandler,
      );
    }
    if (this.groupHeaderDropHandler) {
      tabsContainer.removeEventListener("drop", this.groupHeaderDropHandler);
    }
    if (this.groupHeaderDragLeaveHandler) {
      tabsContainer.removeEventListener(
        "dragleave",
        this.groupHeaderDragLeaveHandler,
      );
    }

    this.groupHeaderDragOverHandler = (e: DragEvent) => {
      const groupHeader = (e.target as HTMLElement).closest(
        ".tab-group-header",
      ) as HTMLElement;
      if (!groupHeader) return;

      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }

      const dragData = e.dataTransfer?.getData("text/html");

      if (dragData && dragData.startsWith("group-")) {
        const draggedGroupId = dragData.replace("group-", "");
        const targetGroupId = groupHeader.getAttribute("data-group-id");
        if (targetGroupId && draggedGroupId !== targetGroupId) {
          groupHeader.classList.add("group-drag-over");
          this.showGroupDropIndicatorOnHeader(groupHeader, e);
        }
      } else if (this.draggedTab) {
        groupHeader.classList.add("group-drag-over-tab");
        this.showTabDropIndicatorOnGroup(groupHeader, e);
      }
    };

    this.groupHeaderDragLeaveHandler = (e: DragEvent) => {
      const groupHeader = (e.target as HTMLElement).closest(
        ".tab-group-header",
      ) as HTMLElement;
      if (!groupHeader) return;

      if (!groupHeader.contains(e.relatedTarget as Node)) {
        groupHeader.classList.remove("group-drag-over-tab", "group-drag-over");
        this.hideTabDropIndicatorOnGroup(groupHeader);
        this.hideGroupDropIndicatorOnHeader(groupHeader);
      }
    };

    this.groupHeaderDropHandler = (e: DragEvent) => {
      const groupHeader = (e.target as HTMLElement).closest(
        ".tab-group-header",
      ) as HTMLElement;
      if (!groupHeader) return;

      e.preventDefault();
      groupHeader.classList.remove("group-drag-over-tab", "group-drag-over");
      this.hideTabDropIndicatorOnGroup(groupHeader);
      this.hideGroupDropIndicatorOnHeader(groupHeader);

      const dragData = e.dataTransfer?.getData("text/html");

      if (dragData && dragData.startsWith("group-")) {
        const draggedGroupId = dragData.replace("group-", "");
        const targetGroupId = groupHeader.getAttribute("data-group-id");
        if (targetGroupId && draggedGroupId !== targetGroupId) {
          this.handleGroupDropOnGroupHeader(
            draggedGroupId,
            targetGroupId,
            e,
            groupHeader,
          );
        }
      } else if (this.draggedTab) {
        const groupId = groupHeader.getAttribute("data-group-id");
        if (groupId) {
          this.handleTabDropOnGroup(this.draggedTab, groupId, e, groupHeader);
        }
      }
    };

    tabsContainer.addEventListener("dragover", this.groupHeaderDragOverHandler);
    tabsContainer.addEventListener("drop", this.groupHeaderDropHandler);
    tabsContainer.addEventListener(
      "dragleave",
      this.groupHeaderDragLeaveHandler,
    );
  }

  private groupHeaderDragOverHandler: ((e: DragEvent) => void) | null = null;
  private groupHeaderDropHandler: ((e: DragEvent) => void) | null = null;
  private groupHeaderDragLeaveHandler: ((e: DragEvent) => void) | null = null;

  showTabDropIndicatorOnGroup(groupHeader: HTMLElement, e: DragEvent) {
    this.hideTabDropIndicatorOnGroup(groupHeader);

    const rect = groupHeader.getBoundingClientRect();
    const isAfter = e.clientX > rect.left + rect.width / 2;

    const indicator = document.createElement("div");
    indicator.className = "tab-group-drop-indicator";
    indicator.style.cssText = `
      position: absolute;
      width: 3px;
      top: 0;
      bottom: 0;
      background: var(--accent);
      z-index: 1002;
      ${isAfter ? "right: -2px;" : "left: -2px;"}
      animation: pulse-indicator 1s ease-in-out infinite;
    `;

    groupHeader.style.position = "relative";
    groupHeader.appendChild(indicator);
  }

  hideTabDropIndicatorOnGroup(groupHeader: HTMLElement) {
    const indicator = groupHeader.querySelector(".tab-group-drop-indicator");
    if (indicator) {
      indicator.remove();
    }
  }

  handleTabDropOnGroup(
    tabId: string,
    groupId: string,
    e: DragEvent,
    groupHeader: HTMLElement,
  ) {
    this.logger.createLog(
      `Handling tab drop on group: tab ${tabId} -> group ${groupId}`,
    );

    const draggedTab = this.tabs.tabs.find((t: any) => t.id === tabId);
    const group = this.tabs.groups.find((g: any) => g.id === groupId);

    if (!draggedTab || !group) return;

    const groupTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId === groupId,
    );
    if (groupTabs.length === 0) return;

    const rect = groupHeader.getBoundingClientRect();
    const isAfter = e.clientX > rect.left + rect.width / 2;

    const currentIndex = this.tabs.tabs.findIndex((t: any) => t.id === tabId);
    if (currentIndex === -1) return;

    const [removed] = this.tabs.tabs.splice(currentIndex, 1);

    if (removed.groupId) {
      this.tabs.groupManager.removeTabFromGroup(tabId);
    }

    let insertIndex: number;
    if (isAfter) {
      const lastGroupTab = groupTabs[groupTabs.length - 1];
      insertIndex =
        this.tabs.tabs.findIndex((t: any) => t.id === lastGroupTab.id) + 1;
    } else {
      const firstGroupTab = groupTabs[0];
      insertIndex = this.tabs.tabs.findIndex(
        (t: any) => t.id === firstGroupTab.id,
      );
    }

    if (currentIndex < insertIndex) {
      insertIndex--;
    }

    this.tabs.tabs.splice(insertIndex, 0, removed);

    this.tabs.reorderTabElements();
    this.handleEnhancedDragEnd();
    this.tabs.layoutTabs();

    this.logger.createLog(
      `Successfully positioned tab ${tabId} ${isAfter ? "after" : "before"} group ${groupId}`,
    );
  }

  setupGroupToGroupDragging() {
    const tabsContainer = this.tabs.el.querySelector(".tabs-content");
    if (!tabsContainer) return;

    tabsContainer.addEventListener("dragstart", (e: DragEvent) => {
      const groupHeader = (e.target as HTMLElement).closest(
        ".tab-group-header",
      ) as HTMLElement;
      if (!groupHeader) return;

      const groupId = groupHeader.getAttribute("data-group-id");
      if (!groupId) return;

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", `group-${groupId}`);
      }

      groupHeader.classList.add("dragging-group");
      document.body.classList.add("group-dragging");

      this.logger.createLog(`Started dragging group ${groupId}`);
    });

    tabsContainer.addEventListener("dragend", (e: DragEvent) => {
      const groupHeader = (e.target as HTMLElement).closest(
        ".tab-group-header",
      ) as HTMLElement;
      if (!groupHeader) return;

      groupHeader.classList.remove("dragging-group");
      document.body.classList.remove("group-dragging");

      document
        .querySelectorAll(".group-drop-indicator")
        .forEach((el) => el.remove());
      document
        .querySelectorAll(".group-drag-over")
        .forEach((el) => el.classList.remove("group-drag-over"));

      this.logger.createLog(`Ended dragging group`);
    });
  }

  handleGroupDropOnGroupHeader(
    draggedGroupId: string,
    targetGroupId: string,
    e: DragEvent,
    groupHeader: HTMLElement,
  ) {
    this.logger.createLog(
      `Handling group drop on group header: ${draggedGroupId} -> ${targetGroupId}`,
    );

    const draggedGroup = this.tabs.groups.find(
      (g: any) => g.id === draggedGroupId,
    );
    const targetGroup = this.tabs.groups.find(
      (g: any) => g.id === targetGroupId,
    );

    if (!draggedGroup || !targetGroup) return;

    const draggedTabs = this.tabs.tabs
      .filter((tab: any) => tab.groupId === draggedGroupId)
      .sort((a: any, b: any) => {
        const aIndex = this.tabs.tabs.findIndex((t: any) => t.id === a.id);
        const bIndex = this.tabs.tabs.findIndex((t: any) => t.id === b.id);
        return aIndex - bIndex;
      });

    const targetTabs = this.tabs.tabs
      .filter((tab: any) => tab.groupId === targetGroupId)
      .sort((a: any, b: any) => {
        const aIndex = this.tabs.tabs.findIndex((t: any) => t.id === a.id);
        const bIndex = this.tabs.tabs.findIndex((t: any) => t.id === b.id);
        return aIndex - bIndex;
      });

    if (targetTabs.length === 0) return;

    const rect = groupHeader.getBoundingClientRect();
    const isInsertAfter = e.clientY > rect.top + rect.height / 2;

    const remainingTabs = this.tabs.tabs.filter(
      (tab: any) => tab.groupId !== draggedGroupId,
    );

    let insertIndex: number;
    if (isInsertAfter) {
      const lastTargetTab = targetTabs[targetTabs.length - 1];
      insertIndex =
        remainingTabs.findIndex((tab: any) => tab.id === lastTargetTab.id) + 1;
    } else {
      const firstTargetTab = targetTabs[0];
      insertIndex = remainingTabs.findIndex(
        (tab: any) => tab.id === firstTargetTab.id,
      );
    }

    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > remainingTabs.length) insertIndex = remainingTabs.length;

    const newTabsOrder = [
      ...remainingTabs.slice(0, insertIndex),
      ...draggedTabs,
      ...remainingTabs.slice(insertIndex),
    ];

    this.tabs.tabs = newTabsOrder;

    this.tabs.reorderTabElements();
    this.tabs.layoutTabs();

    this.logger.createLog(
      `Successfully moved group "${draggedGroup.name}" relative to group "${targetGroup.name}"`,
    );
  }

  showGroupDropIndicatorOnHeader(groupHeader: HTMLElement, e: DragEvent) {
    this.hideGroupDropIndicatorOnHeader(groupHeader);

    const rect = groupHeader.getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;

    const indicator = document.createElement("div");
    indicator.className = "group-drop-indicator";
    indicator.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent);
      z-index: 1000;
      border-radius: 2px;
      ${isAfter ? "bottom: -2px;" : "top: -2px;"}
      animation: pulse-indicator 1s ease-in-out infinite;
    `;

    groupHeader.style.position = "relative";
    groupHeader.appendChild(indicator);
  }

  hideGroupDropIndicatorOnHeader(groupHeader: HTMLElement) {
    const indicator = groupHeader.querySelector(".group-drop-indicator");
    if (indicator) {
      indicator.remove();
    }
  }
}
