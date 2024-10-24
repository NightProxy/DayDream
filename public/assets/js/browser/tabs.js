class Tabs {
  constructor(render, ui, utils, items) {
    this.render = render;
    this.ui = ui;
    this.utils = utils;
    this.items = items;
    this.tabCount = 0;
    this.tabs = [];
    this.groups = [];
    this.draggabillies = [];
    this.el = render.container;

    this.instanceId = 0;
    this.instanceId += 1;

    this.styleEl = document.createElement("style");
    this.el.appendChild(this.styleEl);

    window.addEventListener("resize", (_) => {
      this.layoutTabs();
    });

    this.el.addEventListener("dblclick", (event) => {
      if (
        [this.el, this.el.querySelector(".tabs-content")].includes(event.target)
      )
        this.addTab();
    });

    this.tabEls.forEach((tabEl) => this.setTabCloseEventListener(tabEl));
  }

  get tabEls() {
    return Array.prototype.slice.call(this.el.querySelectorAll(".tab"));
  }

  get tabContentWidths() {
    const numberOfTabs = this.tabEls.length;
    const tabsContentWidth = this.el.querySelector(".tabs-content").clientWidth;
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

    // TODO - Support tabs with different widths / e.g. "pinned" tabs
    const widths = [];
    let extraWidthRemaining = totalExtraWidthDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth =
        flooredClampedTargetWidth < 240 && extraWidthRemaining > 0 ? 1 : 0;
      widths.push(flooredClampedTargetWidth + extraWidth);
    }

    return widths;
  }

  get tabContentPositions() {
    const positions = [];
    const tabContentWidths = this.tabContentWidths;

    let position = 9;
    tabContentWidths.forEach((width, i) => {
      const offset = i * 1;
      positions.push((position + 4) - offset);
      position += width;
    });

    return positions;
  }

  get tabPositions() {
    const positions = [];

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  createTab(url, updateSrc = true) {
    this.tabCount++
    const id = `tab-${this.tabCount}`;
    const iframe = this.ui.createElement("iframe", {
      src: this.utils.processUrl(url),
    });
    iframe.id = id;

    const tab = this.ui.createElement("div", { class: "tab" }, [
      this.ui.createElement("div", { class: "tab-background" }),
      this.ui.createElement("div", { class: "tab-content" }, [
        this.ui.createElement("div", { class: "tab-favicon" }),
        this.ui.createElement("div", { class: "tab-title" }, ["Untitled"]),
        this.ui.createElement("div", { class: "tab-drag-handle" }),
        this.ui.createElement("button", {
          class: "tab-close",
          id: `close-${id}`,
        }, [this.ui.createElement("span", { class: "material-symbols-outlined" }, ["close"])]),
      ]),
      this.ui.createElement("div", { class: "tab-bottom-border" }),
    ]);

    const updateTabTitle = () => {
      if (iframe.contentDocument) {
        const title = iframe.contentDocument.title || "Untitled";
        const tabTitleElement = tab.querySelector(".tab-title");
        if (tabTitleElement && tabTitleElement.textContent !== title) {
          tabTitleElement.textContent = title;
        }
      }
    };

    iframe.onload = updateTabTitle;

    const observer = new MutationObserver(() => {
      updateTabTitle();
      this.utils.setFavicon(tab, iframe);
    });

    iframe.onload = () => {
      updateTabTitle();
      this.utils.setFavicon(tab, iframe);
      observer.observe(iframe.contentDocument.head, {
        childList: true,
        subtree: true,
      });
    };

    tab.addEventListener("click", () => this.selectTab({ tab, iframe, url }));

    tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.ui.contextMenu.create(
        [
          {
            text: "Add to Group",
            action: () => this.createGroupFromContextMenu({ tab, iframe, url }),
          },
          {
            text: "Remove from Group",
            action: () => this.removeTabFromGroup({ tab, iframe, url }),
          },
          {
            text: "Swap to Another Group",
            action: () => this.swapTabToAnotherGroup({ tab, iframe, url }),
          },
          {
            text: "Bookmark this Tab",
            action: () => this.bookmarkCurrentTab(),
          },
          { text: "Close Tab", action: () => this.closeTabById(id) },
          {
            text: "Duplicate Tab",
            action: () => this.duplicateTab({ tab, iframe, url }),
          },
          { text: "Close Group", action: () => this.closeCurrentGroup() },
        ],
        { x: e.pageX, y: e.pageY },
        "contextMenu",
        "",
        "padding: 5px;",
      );
    });

    tab
      .querySelector(`#close-${id}`)
      .addEventListener("click", () => this.closeTabById(id));

    this.items.tabGroupsContainer.appendChild(tab);
    this.items.iframeContainer.appendChild(iframe);

    this.tabs.push({ id, tab, iframe, url });

    this.selectTab({ tab, iframe, url });

    this.layoutTabs();
    this.setupDraggabilly();
  }

  closeTabById(id) {
    const tabInfo = this.tabs.find((tab) => tab.id === id);
    if (tabInfo) {
      tabInfo.tab.remove();
      tabInfo.iframe.remove();
      this.tabs = this.tabs.filter((tab) => tab.id !== id);
      if (this.tabs.length > 0) {
        this.selectTab(this.tabs[0]);
      }
    }
  }

  closeCurrentTab() {
    const activeTab = document.querySelector('.tab.active');
    const activeIFrame = document.querySelector('iframe.active');
    if (activeTab && activeIFrame) {
      const currentTabId = parseInt(activeIFrame.id.replace('tab-', ''));
      activeTab.remove();
      activeIFrame.remove();

      const remainingTabs = document.querySelectorAll('.tab');
      if (remainingTabs.length > 0) {
        const previousTab = document.getElementById(`tab-${currentTabId - 1}`);
        const nextTab = document.getElementById(`tab-${currentTabId + 1}`);
        (previousTab || nextTab || remainingTabs[remainingTabs.length - 1]).click();
      }
    }
  }

  closeAllTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.remove();
    });
    document.querySelector('.iframe-container').querySelectorAll('iframe').forEach(page => {
      page.remove();
    });
  }

  createGroup(name) {
    const existingGroup = this.groups.find(
      (group) => group.header.textContent === name,
    );
    if (existingGroup) {
      return existingGroup.id;
    }

    const groupId = `group-${Date.now()}`;
    const group = this.ui.createElement("div", {
      class: "tab-group",
      id: groupId,
    });
    const groupHeader = this.ui.createElement(
      "div",
      { class: "tab-group-header" },
      [name],
    );
    groupHeader.addEventListener("click", () =>
      group.classList.toggle("collapsed"),
    );

    const groupContent = this.ui.createElement("div", {
      class: "tab-group-content",
    });
    group.appendChild(groupHeader);
    group.appendChild(groupContent);

    this.items.tabGroupsContainer.appendChild(group);
    this.groups.push({
      id: groupId,
      header: groupHeader,
      content: groupContent,
    });

    this.setupDraggabilityTabs();

    return groupId;
  }

  createGroupFromContextMenu(tab) {
    const groupName = prompt("Enter group name:");
    if (groupName) {
      const groupId = this.createGroup(groupName);
      this.addTabToGroup(tab, groupId);
    }
  }

  removeTabFromGroup(tab) {
    const currentGroup = this.groups.find((group) =>
      group.content.contains(tab.tab),
    );
    if (currentGroup) {
      currentGroup.content.removeChild(tab.tab);
      this.updateTabOrder();
    }
  }

  swapTabToAnotherGroup(tab) {
    const groupNames = this.groups.map((group) => group.header.textContent);
    this.ui.contextMenu.create(
      groupNames.map((name) => ({
        text: name,
        action: () => {
          const groupId = this.groups.find(
            (group) => group.header.textContent === name,
          ).id;
          this.addTabToGroup(tab, groupId);
        },
      })),
      { x: event.pageX, y: event.pageY },
      "groupContextMenu",
      "",
      "padding: 5px;",
    );
  }

  addTabToGroup(tab, groupId) {
    const group = this.groups.find((group) => group.id === groupId);
    if (group) {
      group.content.appendChild(tab.tab);
      this.updateTabOrder();
    }
  }

  duplicateTab(tab) {
    if (tab) {
      this.createTab(tab);
    }
  }

  bookmarkCurrentTab() {
    const currentTab = this.tabs.find((tab) =>
      tab.tab.classList.contains("active"),
    );
    if (currentTab) {
      alert(`Bookmarking: ${currentTab.url}`);
    }
  }
  closeCurrentGroup() {
    const currentGroup = this.groups.find((group) =>
      group.content.contains(
        this.items.tabGroupsContainer.querySelector(".tab"),
      ),
    );
    if (currentGroup) {
      currentGroup.content.remove();
      this.groups = this.groups.filter((group) => group.id !== currentGroup.id);
    }
  }

  selectTab(tabInfo) {
    this.tabs.forEach(({ tab, iframe }) => {
      tab.classList.remove("active");
      iframe.classList.remove("active");
    });

    tabInfo.tab.classList.add("active");
    tabInfo.iframe.classList.add("active");

    this.items.addressBar.value = tabInfo.url; //change this to be the URL of the page later

    this.currentTab = tabInfo;
  }

  updateTabOrder() {
    this.tabs.forEach((tab, index) => {
      tab.tab.classList.toggle("active", index === this.currentTabIndex);
    });
  }

  setupDraggabilly() {
    const tabEls = this.tabEls;
    const tabPositions = this.tabPositions;

    if (this.isDragging) {
      this.isDragging = false;
      this.el.classList.remove("tabs-is-sorting");
      this.draggabillyDragging.element.classList.remove("tab-is-dragging");
      this.draggabillyDragging.element.style.transform = "";
      this.draggabillyDragging.dragEnd();
      this.draggabillyDragging.isDragging = false;
      this.draggabillyDragging.positionDrag = (_) => { }; // Prevent Draggabilly from updating tabEl.style.transform in later frames
      this.draggabillyDragging.destroy();
      this.draggabillyDragging = null;
    }

    this.draggabillies.forEach((d) => d.destroy());

    tabEls.forEach((tabEl, originalIndex) => {
      const originalTabPositionX = tabPositions[originalIndex];
      const draggabilly = new Draggabilly(tabEl, {
        axis: "x",
        handle: ".tab-drag-handle",
        containment: this.el.querySelector(".tabs-content"),
      });

      this.draggabillies.push(draggabilly);

      draggabilly.on("dragStart", (_) => {
        this.isDragging = true;
        this.draggabillyDragging = draggabilly;
        tabEl.classList.add("tab-is-dragging");
        this.el.classList.add("tabs-is-sorting");
      });

      draggabilly.on("dragEnd", (_) => {
        this.isDragging = false;
        const finalTranslateX = parseFloat(tabEl.style.left, 10);
        tabEl.style.transform = `translate3d(0, 0, 0)`;

        // Animate dragged tab back into its place
        requestAnimationFrame((_) => {
          tabEl.style.left = "0";
          tabEl.style.transform = `translate3d(${finalTranslateX}px, 0, 0)`;

          requestAnimationFrame((_) => {
            tabEl.classList.remove("tab-is-dragging");
            this.el.classList.remove("tabs-is-sorting");

            requestAnimationFrame((_) => {
              tabEl.style.transform = "";

              this.layoutTabs();
              this.setupDraggabilly();
            });
          });
        });
      });

      draggabilly.on("dragMove", (event, pointer, moveVector) => {
        // Current index be computed within the event since it can change during the dragMove
        const tabEls = this.tabEls;
        const currentIndex = tabEls.indexOf(tabEl);

        const currentTabPositionX = originalTabPositionX + moveVector.x;
        const destinationIndexTarget = utils.closest(
          currentTabPositionX,
          tabPositions,
        );
        const destinationIndex = Math.max(
          0,
          Math.min(tabEls.length, destinationIndexTarget),
        );

        if (currentIndex !== destinationIndex) {
          this.animateTabMove(tabEl, currentIndex, destinationIndex);
        }
        const lastTab = tabEls[tabEls.length - 1];
        const lastTabPosition = this.tabPositions[this.tabPositions.length - 1];
        const lastTabWidth = this.tabContentWidths[this.tabContentWidths.length - 1];
        const translatePx = lastTabPosition + lastTabWidth + (tabEl === lastTab ? (tabEl.getAttribute("data-was-not-last-tab-when-started-dragging") ? moveVector.x - this.tabContentWidths[currentIndex] : moveVector.x) : 0) + 16;
        document.querySelector("#create-tab").style.transform = `translate(min(${translatePx}px, calc(100vw - 46px)),0px)`
      });
    });
  }

  animateTabMove(tabEl, originIndex, destinationIndex) {
    if (destinationIndex < originIndex) {
      tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex]);
    } else {
      tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex + 1]);
    }
    this.layoutTabs();
  }
  layoutTabs() {
    const tabContentWidths = this.tabContentWidths;

    let cumulativeWidth = 0;
    tabContentWidths.forEach((contentWidth) => {
      const tabWidth = Math.min(contentWidth + (2 * 9), 240);
      cumulativeWidth += tabWidth;
      return cumulativeWidth;
    });

    this.tabEls.forEach((tabEl, i) => {
      const contentWidth = tabContentWidths[i];
      const tabWidth = Math.min(contentWidth + (2 * 9), 240);
      tabEl.classList.remove('is-small');
      tabEl.classList.remove('is-smaller');
      tabEl.classList.remove('is-mini');

      tabEl.style.width = tabWidth + "px";
      if (contentWidth < 84) tabEl.classList.add('is-small')
      if (contentWidth < 60) tabEl.classList.add('is-smaller')
      if (contentWidth < 48) tabEl.classList.add('is-mini')
    });

    let styleHTML = "";
    let lastPos = 0;
    this.tabPositions.forEach((position, i) => {

      styleHTML += `
        .${document.querySelector(".tab").parentElement.className} .tab:nth-child(${i + 1}) {
          transform: translate3d(${position}px, 0, 0)
        }
      `; lastPos = position
    });
    this.styleEl.innerHTML = styleHTML;
    document.getElementById("create-tab").style.transform = `translate(${lastPos + this.tabContentWidths[this.tabContentWidths.length - 1] + 28}px)`;
  }

}
