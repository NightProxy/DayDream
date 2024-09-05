class Api {
  constructor(searchVar, transportVar, wispUrl, bareUrl, container) {
    if (!searchVar || !transportVar || !wispUrl || !bareUrl) {
      console.error("All variables are required:", {
        searchVar,
        transportVar,
        wispUrl,
        bareUrl,
      });
    }
    this.proxy = new Proxy(searchVar, transportVar, wispUrl, bareUrl);
    this.plugins = new Plugins(this.proxy);
    this.ui = new UI();
    this.browser = new Browser(container);
  }
}

class crypts {
  encode(str) {
    return encodeURIComponent(
      str
        .toString()
        .split("")
        .map((char, ind) =>
          ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 2) : char,
        )
        .join(""),
    );
  }

  decode(str) {
    try {
      if (str.charAt(str.length - 1) === "/") {
        str = str.slice(0, -1);
      }
      return decodeURIComponent(
        str
          .split("")
          .map((char, ind) =>
            ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 2) : char,
          )
          .join(""),
      );
    } catch (e) {
      console.error("Error decoding URI component:", e);
      return null;
    }
  }
}

class Proxy {
  constructor(searchVar, transportVar, wispUrl, bareUrl) {
    if (!searchVar || !transportVar || !wispUrl || !bareUrl) {
      console.error("Proxy, search, and transport variables are required.");
      return;
    }

    this.crypts = new crypts();

    this.connection = new BareMux.BareMuxConnection("/baremux/worker.js");

    console.log("Proxy variables:", {
      searchVar,
      transportVar,
      wispUrl,
      bareUrl,
    });

    this.searchVar = searchVar;
    this.transportVar = transportVar;
    this.wispUrl = wispUrl;
    this.bareUrl = bareUrl;

    if (!searchVar || !transportVar || !wispUrl || !bareUrl) {
      console.error("One or more variables are null or undefined:", {
        searchVar,
        transportVar,
        wispUrl,
        bareUrl,
      });
    }
  }

  async setTransports() {
    const transports = this.transportVar;
    if (transports === "epoxy") {
      await this.connection.setTransport("/epoxy/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    } else if (transports === "libcurl") {
      await this.connection.setTransport("/libcurl/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    } else if (transports === "baremod") {
      await this.connection.setTransport("/baremod/index.mjs", [this.bareUrl]);
    } else {
      await this.connection.setTransport("/epoxy/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    }
  }

  search(input) {
    input = input.trim();
    const searchTemplate =
      this.searchVar || "https://www.google.com/search?q=%s";

    try {
      return new URL(input).toString();
    } catch (err) {
      try {
        const url = new URL(`http://${input}`);
        if (url.hostname.includes(".")) {
          return url.toString();
        }
        throw new Error("Invalid hostname");
      } catch (err) {
        return searchTemplate.replace("%s", encodeURIComponent(input));
      }
    }
  }

  launch() {
    console.log("Proxy launched.");
  }

  async registerSW(swFile, swConfigSettings) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(async () => {
        await setTransports();
      });
      this.updateSW();
      navigator.serviceWorker.register(swFile, {
        scope: swConfigSettings.prefix,
      });
    }
  }

  updateSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        registration.update();
        console.log(`Service Worker at ${registration.scope} Updated`);
      }
    });
  }

  uninstallSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        registration.unregister();
        console.log(`Service Worker at ${registration.scope} Unregistered`);
      }
    });
  }

  async fetchConfig(url, jsonData) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      jsonData = JSON.parse(text);
      return jsonData;
    } catch (error) {
      console.error("Error fetching the text file:", error);
      return null;
    }
  }
}

class Plugins {
  constructor(proxy) {
    this.plugins = {};
    this.proxy = proxy;
    this.enabledPlugins = [];
    this.disabledPlugins = [];
    this.installedPlugins = [];
    this.loadPlugins();
  }

  async loadPlugins() {
    const storedPlugins = await localforage.getItem("plugins");
    const enabledPlugins = await localforage.getItem("enabledPlugins");
    const disabledPlugins = await localforage.getItem("disabledPlugins");
    const installedPlugins = await localforage.getItem("installedPlugins");

    this.plugins = storedPlugins || {};
    this.enabledPlugins = enabledPlugins || [];
    this.disabledPlugins = disabledPlugins || [];
    this.installedPlugins = installedPlugins || [];
  }

  async savePlugins() {
    await localforage.setItem("plugins", this.plugins);
    await localforage.setItem("enabledPlugins", this.enabledPlugins);
    await localforage.setItem("disabledPlugins", this.disabledPlugins);
    await localforage.setItem("installedPlugins", this.installedPlugins);
  }

  async register(plugin) {
    this.plugins[plugin.name] = {
      ...plugin,
      enabled: false,
    };
    this.installedPlugins.push(plugin.name);
    await this.savePlugins();
    console.log(`Plugin ${plugin.name} registered.`);
  }

  async enable(pluginName) {
    if (this.plugins[pluginName]) {
      this.plugins[pluginName].enabled = true;
      this.enabledPlugins.push(pluginName);
      this.disabledPlugins = this.disabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} enabled.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }

  async disable(pluginName) {
    if (this.plugins[pluginName]) {
      this.plugins[pluginName].enabled = false;
      this.disabledPlugins.push(pluginName);
      this.enabledPlugins = this.enabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} disabled.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }

  async remove(pluginName) {
    if (this.plugins[pluginName]) {
      delete this.plugins[pluginName];
      this.installedPlugins = this.installedPlugins.filter(
        (name) => name !== pluginName,
      );
      this.enabledPlugins = this.enabledPlugins.filter(
        (name) => name !== pluginName,
      );
      this.disabledPlugins = this.disabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} removed.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }
}

class UI {
  constructor() {
    this.contextMenu = null;
    this.menu = null;
    this.initializeComponents();
  }

  initializeComponents() {
    this.contextMenu = new ContextMenu(this);
    this.menu = new Menu(this);
  }

  createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      if (key.startsWith("on")) {
        element[key.toLowerCase()] = value;
      } else if (key === "style") {
        element.style.cssText = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    children.forEach((child) => {
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
    return element;
  }

  showPageFromHash(page, pageDefaultId, navItem, navItemChildren, navActive) {
    let hash = window.location.hash.slice(1);
    if (hash.startsWith("/")) {
      hash = hash.slice(1);
    }

    const pages = document.querySelectorAll(`.${page}`);
    let pageToShow = document.getElementById(pageDefaultId);

    pages.forEach((page) => {
      page.style.display = "none";
    });

    if (hash) {
      const targetPage = document.getElementById(hash);
      if (targetPage) {
        pageToShow = targetPage;
      }
    }
    pageToShow.style.display = "block";

    const settingItems = document.querySelectorAll(`${navItem}`);
    let foundActive = false;

    settingItems.forEach((item) => {
      const navLink = item.querySelector(navItemChildren);
      if (navLink) {
        if (item.dataset.id === hash) {
          navLink.classList.add("navactive");
          foundActive = true;
        } else {
          navLink.classList.remove("navactive");
        }
      }
    });

    if (!foundActive) {
      const defaultSettingItem = document.querySelector(
        `${navItem}[data-id=${pageDefaultId}]`,
      );
      if (defaultSettingItem) {
        const defaultNavLink =
          defaultSettingItem.querySelector(navItemChildren);
        if (defaultNavLink) {
          defaultNavLink.classList.add(navActive);
        }
      }
    }
  }
}

class Menu {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.dropdown = null;
    this.currentPage = null;
  }

  createMenu(dropdownName, dropdownId, { items, pages }) {
    this.container = this.ui.createElement("div", { class: "menu-container" });

    this.menuTopBar = this.ui.createElement("div", { class: "menu-top-bar" });

    const closeButton = this.ui.createElement(
      "button",
      { class: "close-button" },
      [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, [
          "close",
        ]),
      ],
    );
    closeButton.onclick = () => this.closeMenu();

    this.dropdown = this.ui.createElement("div", {
      class: "dropdown",
      id: dropdownId,
    });
    this.dropdownButton = this.ui.createElement(
      "div",
      { class: "dropdown-button" },
      [
        this.ui.createElement("span", { class: "button-text" }, [dropdownName]),
        this.ui.createElement("span", { class: "material-symbols-outlined" }, [
          "keyboard_arrow_down",
        ]),
      ],
    );
    this.dropdownButton.addEventListener("click", () => {
      const isVisible = this.dropdownOptions.style.display === "block";
      this.dropdownOptions.style.display = isVisible ? "none" : "block";
      this.dropdownButton.classList.toggle("active", !isVisible);
    });

    this.dropdownOptions = this.ui.createElement("ul", {
      class: "dropdown-options",
    });
    items.forEach((item) => {
      const option = this.ui.createElement("li", { "data-id": item.pageId }, [
        item.label,
      ]);
      option.onclick = () => {
        this.showPage(item.pageId);
        const isVisible = this.dropdownOptions.style.display === "block";
        this.dropdownOptions.style.display = isVisible ? "none" : "block";
        this.dropdownButton.classList.toggle("active", !isVisible);
      };
      this.dropdownOptions.appendChild(option);
    });

    this.dropdown.appendChild(this.dropdownButton);
    this.dropdown.appendChild(this.dropdownOptions);

    this.menuTopBar.appendChild(this.dropdown);
    this.menuTopBar.appendChild(closeButton);

    this.container.appendChild(this.menuTopBar);

    const contentArea = this.ui.createElement("div", { class: "content-area" });
    this.container.appendChild(contentArea);

    this.pages = {};
    pages.forEach((page) => {
      const pageDiv = this.ui.createElement("div", {
        class: "menu-page",
        id: page.id,
        "data-id": page.id,
      });
      pageDiv.innerHTML = page.content;
      this.pages[page.id] = pageDiv;
      contentArea.appendChild(pageDiv);
    });

    Object.values(this.pages).forEach((page) => (page.style.display = "none"));

    if (pages.length > 0) {
      this.showPage(pages[0].id);
    }

    document.body.appendChild(this.container);

    setTimeout(() => {
      this.container.classList.add("visible");
    }, 0);

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".dropdown")) {
        document.querySelectorAll(".dropdown-button.active").forEach((btn) => {
          btn.classList.remove("active");
          const dropdownOptions = btn.nextElementSibling;
          if (dropdownOptions) {
            dropdownOptions.style.display = "none";
          }
        });
      }
    });
  }

  showPage(pageId) {
    Object.values(this.pages).forEach((page) => (page.style.display = "none"));
    const page = this.pages[pageId];
    if (page) {
      page.style.display = "block";
      this.currentPage = pageId;
    }
  }

  closeMenu() {
    this.container.classList.remove("visible");
    setTimeout(() => {
      document.body.removeChild(this.container);
    }, 300);
  }
}

class ContextMenu {
  constructor(ui) {
    this.ui = ui;
    this.currentMenu = null;
    this.hideMenu = this.hideMenu.bind(this);
  }

  create(items, position, id, style, itemStyle) {
    if (this.currentMenu) {
      this.currentMenu.remove();
    }

    this.currentMenu = this.ui.createElement(
      "div",
      {
        id: id,
        style: `position: absolute; top: ${position.y}px; left: ${position.x}px; ${style}`,
      },
      items.map((item) =>
        this.ui.createElement(
          "div",
          {
            style: `cursor: pointer; ${itemStyle}`,
          },
          [
            this.ui.createElement(
              "button",
              {
                onclick: item.action,
              },
              [item.text],
            ),
          ],
        ),
      ),
    );

    document.body.appendChild(this.currentMenu);

    document.addEventListener("click", this.hideMenu, { once: true });
  }

  hideMenu(event) {
    if (this.currentMenu && !this.currentMenu.contains(event.target)) {
      this.currentMenu.remove();
      this.currentMenu = null;
    }
  }
}
class Browser {
  constructor(container) {
    this.ui = new UI();
    this.container = container;
    this.tabs = [];
    this.groups = [];
    this.draggabillies = []
    if (this.container) {
      this.init();
    }
    this.devToggle = false;
    this.erudaScriptLoaded = false;
  }

  init() {
    this.container.innerHTML = `
        <div class="surface">
            <div class="mock-browser">
                <div class="tabs" style="--tab-content-margin: 9px">
                        <div class="tabs-content" id="tab-groups"></div>
                    <div class="tabs-bottom-bar"></div>
                    <!-- Styles to prevent flash after JS initialization -->
                    <style>
                        .tabs .tab {
                            width: 258px;
                        }
                            .tabs .tab:nth-child(1) {
                            transform: translate3d(0px, 0, 0);
                        }

                        .tabs .tab:nth-child(2) {
                            transform: translate3d(239px, 0, 0);
                        }
                    </style>
                </div>
                <div class="tabs-optional-shadow-below-bottom-bar"></div>
                <div class="under-tabs">
                    <button class="browser-button" id="create-tab"><span class="material-symbols-outlined">add</span></button>
                    <button class="browser-button" id="backward"><span class="material-symbols-outlined">arrow_back</span></button>
                    <button class="browser-button" id="reload"><span class="material-symbols-outlined">refresh</span></button>
                    <button class="browser-button" id="forward"><span class="material-symbols-outlined">arrow_forward</span></button>
                    <input type="text" class="address-bar" id="uv-address" placeholder="Enter URL" />
                    <button class="browser-button" id="bookmark"><span class="material-symbols-outlined">star</span></button>
                    <button class="browser-button" id="more-options"><span class="material-symbols-outlined">tune</span></button>
                </div>
            </div>
            <div class="iframe-container" id="iframe-container"></div>
        </div>
        `;

    this.tabGroupsContainer = document.getElementById("tab-groups");
    this.iframeContainer = document.getElementById("iframe-container");
    this.addressBar = document.getElementById("uv-address");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.bookmarkButton = document.getElementById("bookmark");
    this.extrasButton = document.getElementById("more-options");

    this.backButton.addEventListener("click", () => {
      this.backward();
    });
    this.reloadButton.addEventListener("click", () => {
      this.refresh();
    });
    this.forwardButton.addEventListener("click", () => {
      this.forward();
    });

    this.extrasButton.addEventListener("click", (event) => {
      this.extrasmenu(event);
    });

    document
      .getElementById("create-tab")
      .addEventListener("click", () => this.createTab("tabs://newtab"));

    this.el = this.container;

    this.instanceId = 0
    this.instanceId += 1

    this.styleEl = document.createElement('style')
    this.el.appendChild(this.styleEl)

    window.addEventListener('resize', _ => {
      this.cleanUpPreviouslyDraggedTabs()
      this.layoutTabs()
    })

    this.el.addEventListener('dblclick', event => {
      if ([this.el, this.el.querySelector('.tabs-content')].includes(event.target)) this.addTab()
    })

    this.tabEls.forEach((tabEl) => this.setTabCloseEventListener(tabEl))

    this.layoutTabs()
    this.setupDraggabilly()
  }

  closest(value, array) {
    let closest = Infinity
    let closestIndex = -1

    array.forEach((v, i) => {
      if (Math.abs(value - v) < closest) {
        closest = Math.abs(value - v)
        closestIndex = i
      }
    })

    return closestIndex
  }

  get tabEls() {
    return Array.prototype.slice.call(this.el.querySelectorAll('.tab'))
  }

  get tabContentWidths() {
    const numberOfTabs = this.tabEls.length
    const tabsContentWidth = this.el.querySelector('.tabs-content').clientWidth
    const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * 1
    const targetWidth = (tabsContentWidth - (2 * 9) + tabsCumulativeOverlappedWidth) / numberOfTabs
    const clampedTargetWidth = Math.max(24, Math.min(240, targetWidth))
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth)
    const totalTabsWidthUsingTarget = (flooredClampedTargetWidth * numberOfTabs) + (2 * 9) - tabsCumulativeOverlappedWidth
    const totalExtraWidthDueToFlooring = tabsContentWidth - totalTabsWidthUsingTarget

    // TODO - Support tabs with different widths / e.g. "pinned" tabs
    const widths = []
    let extraWidthRemaining = totalExtraWidthDueToFlooring
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth = flooredClampedTargetWidth < 240 && extraWidthRemaining > 0 ? 1 : 0
      widths.push(flooredClampedTargetWidth + extraWidth)
      if (extraWidthRemaining > 0) extraWidthRemaining -= 1
    }

    return widths
  }

  get tabContentPositions() {
    const positions = []
    const tabContentWidths = this.tabContentWidths

    let position = 9
    tabContentWidths.forEach((width, i) => {
      const offset = i * 1
      positions.push(position - offset)
      position += width
    })

    return positions
  }

  get tabPositions() {
    const positions = []

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition - 9)
    })

    return positions
  }

  createTab(url, updateSrc = true) {
    const id = `tab-${Date.now()}`;
    const iframe = this.ui.createElement("iframe", {
      src: this.processUrl(url),
    });
    iframe.id = id;

    this.svg = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="tab-geometry-left" viewBox="0 0 214 36">
            <!-- Path adjusted for cut-off corners and unified border -->
            <path d="M12 0 L24 10 H197 V36 H0 V-2 C4.5 0 9 -3.5 9 -8 V8 C0 -4.5 3.5 -8 12 0 Z" />
          </symbol>
          <symbol id="tab-geometry-right" viewBox="0 0 214 36">
            <path d="M17 0 H197 C202.5 0 207 3.5 207 8 V28 C207 32.5 202.5 36 197 36 H0 V0 Z"/>
          </symbol>
      
          <clipPath id="crop">
            <rect class="mask" width="100%" height="100%" x="0"/>
          </clipPath>
        </defs>
      
        <!-- Main container to hold the left and right parts together -->
        <g style="stroke: var(--tab-border-color); stroke-width: 2px; fill: none;">
          <!-- Left side of the tab -->
          <svg width="52%" height="100%">
            <use xlink:href="#tab-geometry-left" width="214" height="36" class="tab-geometry" />
          </svg>
      
          <!-- Right side of the tab mirrored -->
          <g transform="scale(-1, 1)">
            <svg width="52%" height="100%" x="-100%" y="0">
              <use xlink:href="#tab-geometry-right" width="214" height="36" class="tab-geometry" />
            </svg>
          </g>
        </g>
      </svg>`

    const tab = this.ui.createElement("div", { class: "tab" }, [
      this.ui.createElement("div", { class: "tab-dividers" }),
      this.ui.createElement("div", { class: "tab-background" }, [/*
        this.ui.createElement("svg", { version: "1.1", xmlns: "http://www.w3.org/2000/svg" }, [
          this.ui.createElement("defs", {}, [
            this.ui.createElement("symbol", { id: "tab-geometry-left", viewBox: "0 0 214 36" }, [
              this.ui.createElement("path", { d: "M12 0 L24 10 H197 V36 H0 V-2 C4.5 0 9 -3.5 9 -8 V8 C0 -4.5 3.5 -8 12 0 Z" })
            ]),
            this.ui.createElement("symbol", { id: "tab-geometry-right", viewBox: "0 0 214 36" }, [
              this.ui.createElement("path", { d: "M17 0 H197 C202.5 0 207 3.5 207 8 V28 C207 32.5 202.5 36 197 36 H0 V0 Z" })
            ]),
            this.ui.createElement("clipPath", { id: "crop" }, [
              this.ui.createElement("rect", { class: "mask", width: "100%", height: "100%", x: "0" })
            ])
          ]),
          this.ui.createElement("g", { style: "stroke: var(--tab-border-color); stroke-width: 2px; fill: none;" }, [
            this.ui.createElement("svg", { width: "52%", height: "100%" }, [
              this.ui.createElement("use", { xlinkHref: "#tab-geometry-left", width: "214", height: "36", class: "tab-geometry" })
            ]),
            this.ui.createElement("g", { transform: "scale(-1, 1)" }, [
              this.ui.createElement("svg", { width: "52%", height: "100%", x: "-100%", y: "0" }, [
                this.ui.createElement("use", { xlinkHref: "#tab-geometry-right", width: "214", height: "36", class: "tab-geometry" })
              ])
            ])
          ])
        ])*/
      ]),
      this.ui.createElement("div", { class: "tab-content" }, [
        this.ui.createElement("div", { class: "tab-favicon" }),
        this.ui.createElement("div", { class: "tab-title" }, ["Untitled"]),
        this.ui.createElement("div", { class: "tab-drag-handle" }),
        this.ui.createElement("button", {
          class: "tab-close",
          id: `close-${id}`,
        }),
      ]),
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
    });

    iframe.onload = () => {
      updateTabTitle();
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

    this.tabGroupsContainer.appendChild(tab);
    this.iframeContainer.appendChild(iframe);

    this.tabs.push({ id, tab, iframe, url });

    this.selectTab({ tab, iframe, url });

    this.cleanUpPreviouslyDraggedTabs()
    this.layoutTabs()
    this.setupDraggabilly()

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

    this.tabGroupsContainer.appendChild(group);
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
    const newUrl = prompt("Enter URL for the duplicate tab:");
    if (newUrl) {
      this.createTab(newUrl);
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

  closeCurrentTab() {
    const currentTab = this.tabs.find((tab) =>
      tab.tab.classList.contains("active"),
    );
    if (currentTab) {
      this.closeTabById(currentTab.id);
    }
  }

  closeCurrentGroup() {
    const currentGroup = this.groups.find((group) =>
      group.content.contains(this.tabGroupsContainer.querySelector(".tab")),
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

    this.addressBar.value = tabInfo.url;

    this.currentTab = tabInfo;
  }

  updateTabOrder() {
    this.tabs.forEach((tab, index) => {
      tab.tab.classList.toggle("active", index === this.currentTabIndex);
    });
  }

  processUrl(url) {
    if (url.startsWith("tabs://")) {
      const path = url.replace("tabs://", "");
      return `/tabs/${path}`;
    } else if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("/")
    ) {
      return url;
    } else {
      return `/tabs/${url}`;
    }
  }

  navigate(url) {
    const processedUrl = this.processUrl(url);
    const iframe = this.iframeContainer.querySelector("iframe.active");
    if (iframe) {
      iframe.src = processedUrl;
    }
  }

  setupDraggabilly() {
    const tabEls = this.tabEls
    const tabPositions = this.tabPositions

    if (this.isDragging) {
      this.isDragging = false
      this.el.classList.remove('tabs-is-sorting')
      this.draggabillyDragging.element.classList.remove('tab-is-dragging')
      this.draggabillyDragging.element.style.transform = ''
      this.draggabillyDragging.dragEnd()
      this.draggabillyDragging.isDragging = false
      this.draggabillyDragging.positionDrag = _ => { } // Prevent Draggabilly from updating tabEl.style.transform in later frames
      this.draggabillyDragging.destroy()
      this.draggabillyDragging = null
    }

    this.draggabillies.forEach(d => d.destroy())

    tabEls.forEach((tabEl, originalIndex) => {
      const originalTabPositionX = tabPositions[originalIndex]
      const draggabilly = new Draggabilly(tabEl, {
        axis: 'x',
        handle: '.tab-drag-handle',
        containment: this.el.querySelector('.tabs-content')
      })

      this.draggabillies.push(draggabilly)

      draggabilly.on('pointerDown', _ => {
        this.setCurrentTab(tabEl)
      })

      draggabilly.on('dragStart', _ => {
        this.isDragging = true
        this.draggabillyDragging = draggabilly
        tabEl.classList.add('tab-is-dragging')
        this.el.classList.add('tabs-is-sorting')
      })

      draggabilly.on('dragEnd', _ => {
        this.isDragging = false
        const finalTranslateX = parseFloat(tabEl.style.left, 10)
        tabEl.style.transform = `translate3d(0, 0, 0)`

        // Animate dragged tab back into its place
        requestAnimationFrame(_ => {
          tabEl.style.left = '0'
          tabEl.style.transform = `translate3d(${finalTranslateX}px, 0, 0)`

          requestAnimationFrame(_ => {
            tabEl.classList.remove('tab-is-dragging')
            this.el.classList.remove('tabs-is-sorting')

            tabEl.classList.add('tab-was-just-dragged')

            requestAnimationFrame(_ => {
              tabEl.style.transform = ''

              this.layoutTabs()
              this.setupDraggabilly()
            })
          })
        })
      })

      draggabilly.on('dragMove', (event, pointer, moveVector) => {
        // Current index be computed within the event since it can change during the dragMove
        const tabEls = this.tabEls
        const currentIndex = tabEls.indexOf(tabEl)

        const currentTabPositionX = originalTabPositionX + moveVector.x
        const destinationIndexTarget = this.closest(currentTabPositionX, tabPositions)
        const destinationIndex = Math.max(0, Math.min(tabEls.length, destinationIndexTarget))

        if (currentIndex !== destinationIndex) {
          this.animateTabMove(tabEl, currentIndex, destinationIndex)
        }
      })
    })
  }

  animateTabMove(tabEl, originIndex, destinationIndex) {
    if (destinationIndex < originIndex) {
      tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex])
    } else {
      tabEl.parentNode.insertBefore(tabEl, this.tabEls[destinationIndex + 1])
    }
    this.emit('tabReorder', { tabEl, originIndex, destinationIndex })
    this.layoutTabs()
  }

  cleanUpPreviouslyDraggedTabs() {
    this.tabEls.forEach((tabEl) => tabEl.classList.remove('tab-was-just-dragged'))
  }

  layoutTabs() {
    const tabContentWidths = this.tabContentWidths

    this.tabEls.forEach((tabEl, i) => {
      const contentWidth = tabContentWidths[i]
      const width = contentWidth + (2 * 9)

      tabEl.style.width = width + 'px'
    })

    let styleHTML = ''
    this.tabPositions.forEach((position, i) => {
      styleHTML += `
          #${this.container.id} .tab:nth-child(${i + 1}) {
            transform: translate3d(${position}px, 0, 0)
          }
        `
    })
    this.styleEl.innerHTML = styleHTML
  }


  backward() {
    document.querySelector("iframe.active").contentWindow.history.back();
  }

  forward() {
    document.querySelector("iframe.active").contentWindow.history.forward();
  }

  refresh() {
    document.querySelector("iframe.active").src =
      document.querySelector("iframe.active").src;
  }

  injectErudaScript(iframeDocument) {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve();
        return;
      }

      const script = iframeDocument.createElement("script");
      script.src = "/assets/js/lib/eruda/eruda.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        resolve();
      };
      script.onerror = (event) =>
        reject(new Error("Failed to load Eruda script:", event));
      iframeDocument.head.appendChild(script);
    });
  }

  inspectelement() {
    const iframe = document.querySelector("iframe.active");
    if (iframe && iframe.contentWindow) {
      const iframeDocument = iframe.contentWindow.document;

      this.injectErudaScript(iframeDocument)
        .then(() => {
          if (this.devToggle) {
            iframe.contentWindow.eruda.hide();
            iframe.contentWindow.eruda.destroy();
          } else {
            iframe.contentWindow.eruda.init();
            iframe.contentWindow.eruda.show();
          }

          this.devToggle = !this.devToggle;
        })
        .catch((error) => {
          console.error("Error injecting Eruda script:", error);
        });
    } else {
      console.error("Iframe not found or inaccessible.");
    }
  }

  extrasmenu(e) {
    const elements = {
      items: [
        { pageId: "home", label: "Home" },
        { pageId: "bookmarks", label: "Bookmarks" },
        { pageId: "history", label: "History" },
      ],
      pages: [
        { id: "home", content: "<div>Home Page Content</div>" },
        { id: "bookmarks", content: "<div>Bookmarks Content</div>" },
        { id: "history", content: "<div>History Content</div>" },
      ],
    };

    this.ui.menu.createMenu("Home", "menuDropdown", elements);
  }
}