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
    this.erudaScriptInjecting = false;

    if (this.container) {
      this.afterInit()
    }
  }

  init() {
    this.container.innerHTML = `
        <div class="surface">
            <div class="mock-browser">
                <div class="tabs" style="--tab-content-margin: 9px">
                        <div style="display:flex;" >
                        <div class="tabs-content" id="tab-groups"></div>
                        <div class="browser-button" id="create-tab"><span class="material-symbols-outlined">add</span></div>
                        </div>
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
                <div class="tabs-bottom-bar"></div>

			<ul class="utility">
      <li>
					<div class="utilityIcon" id="home">
						<span class="material-symbols-outlined"
							>home</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="backward">
						<span class="material-symbols-outlined backButton"
							>arrow_back</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="reload">
						<span class="material-symbols-outlined refreshButton"
							>refresh</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon"id="forward">
						<span class="material-symbols-outlined forwardButton"
							>arrow_forward</span
						>
					</div>
				</li>
				<div
					class="search-header"
					style="flex-grow: 1; margin-left: 8px; margin-right: 8px"
				>
					<input
						placeholder="Enter search or web address"
						class="search-header__input"
						id="uv-address"
						type="text"
					/>
					<div class="webSecurityIcon"></div>
					<button
						aria-label="search"
						style="
							user-select: none;
							cursor: default;
							position: absolute;
							margin-left: 7px;
							margin-bottom: -2px;
						"
						type="submit"
						class="search-header__button"
					>
						<svg
							fill="none"
							viewBox="0 0 18 18"
							height="18"
							width="18"
							class="search-header__icon"
						>
							<path
								fill="#3A3A3A"
								d="M7.132 0C3.197 0 0 3.124 0 6.97c0 3.844 3.197 6.969 7.132 6.969 1.557 0 2.995-.49 4.169-1.32L16.82 18 18 16.847l-5.454-5.342a6.846 6.846 0 0 0 1.718-4.536C14.264 3.124 11.067 0 7.132 0zm0 .82c3.48 0 6.293 2.748 6.293 6.15 0 3.4-2.813 6.149-6.293 6.149S.839 10.37.839 6.969C.839 3.568 3.651.82 7.132.82z"
							></path>
						</svg>
					</button>
				</div>
        <div class="right">
				<li>
					<div class="utilityIcon" id="bookmark">
						<span class="material-symbols-outlined bookmarkButton"
							>star</span
						>
					</div>
				</li>
        <li>
					<div class="utilityIcon" id="inspect">
						<span class="material-symbols-outlined erudaButton"
							>code</span
						>
					</div>
				</li>
				<li>
					<div class="utilityIcon" id="more-options">
						<span class="material-symbols-outlined erudaButton"
							>more_horiz</span
						>
					</div>
				</li>
        </div>
			</ul>
                </div>
            </div>
            <div class="viewport">
            <ul class="navbar">
			<li>
				<a href="/g"
					><span class="material-symbols-outlined gPage"
						>joystick</span
					></a
				>
			</li>
			<li>
				<a href="/a"
					><span class="material-symbols-outlined aPage"
						>apps</span
					></a
				>
			</li>
			<li>
				<a href="/&"
					><span class="material-symbols-outlined pPage"
						>public</span
					></a
				>
			</li>
			<hr />
			<li>
				<a href="/~"
					><span
						style="margin-top: 0"
						class="material-symbols-outlined"
						>tune</span
					></a
				>
			</li>
			<li>
				<a target="_blank" href="https://discord.night-x.com">
					<div
						style="
							height: 40px !important;
							width: 40px !important;
							margin-top: 10px;
							margin-bottom: -6px;
						"
					>
						<i
							class="fa-brands fa-discord"
							style="transform: translateY(-6px)"
						></i>
					</div>
				</a>
			</li>
		</ul>
    <svg
				xmlns="http://www.w3.org/2000/svg"
				width="30"
				height="30"
				viewBox="0 0 30 30"
				fill="none"
				style="
					position: absolute;
					z-index: 2147483646;
					left: calc(2.0em + 9.63px);
					top: calc(46px + 3em);
				"
			>
				<path
					d="M30 0H0V30C0 30 -1.11468e-05 18.2353 8.86364 9.11765C17.7273 0 30 0 30 0Z"
					fill="#161616"
				/>
			</svg>

			
            <div class="iframe-container" id="iframe-container"></div>
            </div>
        </div>
        `;

    this.tabGroupsContainer = document.getElementById("tab-groups");
    this.iframeContainer = document.getElementById("iframe-container");
    this.addressBar = document.getElementById("uv-address");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.bookmarkButton = document.getElementById("bookmark");
    this.inspectButton = document.getElementById("inspect");
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

    this.inspectButton.addEventListener("click", () => {
      this.inspectelement();
    })

    this.extrasButton.addEventListener("click", (event) => {
      this.extrasmenu(event);
    });

    document
      .getElementById("create-tab")
      .addEventListener("click", () => this.createTab("daydream://newtab"));

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

  afterInit() {
    if (document.querySelector("iframe.active")) {
      this.tabDoc = document.querySelector("iframe.active").contentWindow.document
    }
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

    const tab = this.ui.createElement("div", { class: "tab" }, [
      this.ui.createElement("div", { class: "tab-background" }),
      this.ui.createElement("div", { class: "tab-content" }, [
        this.ui.createElement("div", { class: "tab-favicon" }),
        this.ui.createElement("div", { class: "tab-title" }, ["Untitled"]),
        this.ui.createElement("div", { class: "tab-drag-handle" }),
        this.ui.createElement("button", {
          class: "tab-close",
          id: `close-${id}`,
        }),
      ]),
      this.ui.createElement("div", { class: "tab-bottom-border" })
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
      this.setFavicon(tab, iframe);

    });

    iframe.onload = () => {
      updateTabTitle();
      this.setFavicon(tab, iframe);
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


  setFavicon(tabElement, iframe) {
    iframe.addEventListener('load', () => {
      try {
        if (!iframe.contentDocument) {
          console.error('Unable to access iframe content due to cross-origin restrictions.');
          return;
        }

        let favicon = null;
        const nodeList = iframe.contentDocument.querySelectorAll("link[rel~='icon']");

        for (let i = 0; i < nodeList.length; i++) {
          const relAttr = nodeList[i].getAttribute("rel");
          if (relAttr.includes("icon")) {
            favicon = nodeList[i];
            break;
          }
        }

        if (favicon) {
          const faviconUrl = favicon.href || favicon.getAttribute('href');
          const faviconImage = tabElement.querySelector('.tab-favicon');

          if (faviconUrl && faviconImage) {
            faviconImage.style.backgroundImage = `url('${faviconUrl}')`;
          } else {
            console.error('Favicon URL or favicon element is missing.');
          }
        } else {
          console.error('No favicon link element found within the iframe document.');
        }
      } catch (error) {
        console.error('An error occurred while setting the favicon:', error);
      }
    });
  }

  async getFavicon(url) {
    try {
      var googleFaviconUrl = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(url)}`;

      const response = await fetch(googleFaviconUrl);
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error fetching favicon as data URL:", error);
      return null;
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
    let js = "";
    if (url.startsWith("daydream://")) {
      const path = url.replace("daydream://", "");
      return `/internal/${path}.html`;
    } else if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("/") ||
      url.startsWith("data:")
    ) {
      return url;
    } else if (
      url.startsWith("javascript:")
    ) {
      js = url.replace("javascript:", "")
      document.querySelector("iframe.active").contentWindow.eval(js)
    } else {
      return url;
    }
  }

  getInternalURL(url) {
    if (url.startsWith("/internal/")) {
      const path = url.replace("/internal/", "");
      return `daydream://${path}`;
    } else if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("daydream://") ||
      url.startsWith("data:") ||
      url.startsWith("javascript:")
    ) {
      return null;
    } else {
      return `daydream://${url}`;
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

      if (this.erudaScriptInjecting) {
        console.warn('Eruda script is already being injected.');
        resolve();
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement('script');
      script.type = 'text/javascript';
      script.src = '/assets/js/lib/eruda/eruda.js';
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve();
      };
      script.onerror = event => {
        this.erudaScriptInjecting = false;
        reject(new Error('Failed to load Eruda script:', event));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument) {
    return new Promise(resolve => {
      const script = iframeDocument.createElement('script');
      script.type = 'text/javascript';
      script.textContent = `
			eruda.init({
				defaults: {
					displaySize: 50,
					transparency: 0.9,
					theme: 'Material Palenight'
				}
			});
			eruda.show();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  injectHideScript(iframeDocument) {
    return new Promise(resolve => {
      const script = iframeDocument.createElement('script');
      script.type = 'text/javascript';
      script.textContent = `
			eruda.hide();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }
  inspectelement() {
    const iframe = document.querySelector('iframe.active');
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)"
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ['about:blank', null, 'a%60owt8bnalk', 'a`owt8bnalk'];
    if (iframe.contentWindow.location.href.includes(forbiddenSrcs)) {
      console.warn('Iframe src is forbidden, skipping.');
      return;
    }

    if (iframe.contentWindow.document.readyState == 'loading') {
      console.warn(
        'Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck.'
      );
      return;
    }

    this.injectErudaScript(iframeDocument)
      .then(() => {
        if (!this.devToggle) {
          this.injectShowScript(iframeDocument);
        } else {
          this.injectHideScript(iframeDocument);
        }

        this.devToggle = !this.devToggle;
      })
      .catch(error => {
        console.error('Error injecting Eruda script:', error);
      });

    iframe.contentWindow.addEventListener('unload', () => {
      this.devToggle = false;
      this.erudaScriptLoaded = false;
      this.erudaScriptInjecting = false;
      console.log('Iframe navigation detected, Eruda toggle reset.');
    });
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

/*
let historyArray = JSON.parse(localStorage.getItem('historyArray')) || [];
let currentIndex = parseInt(localStorage.getItem('currentIndex')) || -1;

if (historyArray.length > 0) {
  currentIndex = historyArray.length;
  saveHistory();
}

function saveHistory() {
  localStorage.setItem('historyArray', JSON.stringify(historyArray));
  localStorage.setItem('currentIndex', currentIndex.toString());
}*/