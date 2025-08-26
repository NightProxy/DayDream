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

      tabEl.addEventListener("dragstart", dragStartHandler);
      tabEl.addEventListener("dragover", dragOverHandler);
      tabEl.addEventListener("dragenter", dragEnterHandler);
      tabEl.addEventListener("dragleave", dragLeaveHandler);
      tabEl.addEventListener("drop", dropHandler);
      tabEl.addEventListener("dragend", dragEndHandler);
    });

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

    this.highlightDropZones();
    this.eventsAPI.emit("tab:dragStart", { tabId });
  };

  handleEnhancedDragOver = (e: DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }

    this.updateDropIndicator(targetTabId);

    if (this.draggedTab && this.draggedTab !== targetTabId) {
      const draggedTab = this.tabs.tabs.find(
        (t: any) => t.id === this.draggedTab,
      );
      const targetTab = this.tabs.tabs.find((t: any) => t.id === targetTabId);
      const targetElement = document.querySelector(
        `[data-tab-id="${targetTabId}"]`,
      ) as HTMLElement;

      if (draggedTab && targetTab && targetElement) {
        const wouldUngroup = this.shouldUngroupBasedOnPosition(
          e,
          draggedTab,
          targetTab,
          targetElement,
        );

        if (wouldUngroup && draggedTab.groupId) {
          targetElement.classList.add("ungroup-indicator");
        } else {
          targetElement.classList.remove("ungroup-indicator");
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
    if (this.dragCounter === 0) {
      this.removeDropIndicator();

      document.querySelectorAll(".ungroup-indicator").forEach((el) => {
        el.classList.remove("ungroup-indicator");
      });
    }
  };

  handleEnhancedDrop = (e: DragEvent, targetTabId: string) => {
    e.preventDefault();
    this.dragCounter = 0;

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
    const shouldUngroup = this.shouldUngroupBasedOnPosition(
      e,
      draggedTab,
      targetTab,
      targetElement,
    );

    if (shouldUngroup && draggedTab.groupId) {
      this.tabs.groupManager.removeTabFromGroup(this.draggedTab);
    } else if (!shouldUngroup && draggedTab.groupId !== targetTab.groupId) {
      if (draggedTab.groupId) {
        this.tabs.groupManager.removeTabFromGroup(this.draggedTab);
      }
      if (targetTab.groupId) {
        this.tabs.groupManager.addTabToGroup(
          this.draggedTab,
          targetTab.groupId,
        );
      }
    }

    this.moveTabToPosition(this.draggedTab, targetTabId, e);
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
    if (!draggedTab.groupId) return false;
    if (!targetTab.groupId) return true;
    if (draggedTab.groupId !== targetTab.groupId) return false;
    if (!targetElement) return false;

    const rect = targetElement.getBoundingClientRect();
    const mouseX = e.clientX;

    const group = this.tabs.groups.find(
      (g: any) => g.id === draggedTab.groupId,
    );
    if (!group) return false;

    const groupTabs = this.tabs.tabs.filter((t: any) => t.groupId === group.id);
    const isFirstTabInGroup = groupTabs[0]?.id === targetTab.id;
    const isLastTabInGroup =
      groupTabs[groupTabs.length - 1]?.id === targetTab.id;

    const edgeThreshold = 30;

    if (isFirstTabInGroup && mouseX < rect.left + edgeThreshold) return true;
    if (isLastTabInGroup && mouseX > rect.right - edgeThreshold) return true;

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
  }

  hideDropZones() {
    document.body.classList.remove("tab-dragging");
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
}
