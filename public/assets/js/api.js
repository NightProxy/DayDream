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
                        <div style="display:flex;" >
                        <div class="tabs-content" id="tab-groups"></div>
                        <div class="browser-button" id="create-tab"><span class="material-symbols-outlined">add</span></div>
                        </div>
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
						style="flex-grow: 1"
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
        <hr>
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
				<a target="_blank" href="https://discord.gointospace.app">
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

    this.svg = `<svg width="328" height="36" viewBox="0 0 328 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_5_21)">
<g clip-path="url(#clip1_5_21)">
<path d="M197 0.25H0.25V35.75H213.75V34.2465C211.522 34.1845 209.318 33.2987 207.65 31.8778C205.919 30.4029 204.75 28.3375 204.75 26V8C204.75 3.63807 201.362 0.25 197 0.25Z" fill="#131313" stroke="#AA00FF" stroke-width="0.5"/>
</g>
</g>
<g clip-path="url(#clip2_5_21)">
<path d="M131.084 0.269796L131.104 0.25H327.75V35.75H114.25V34.2465C116.478 34.1845 118.682 33.2987 120.35 31.8778C122.081 30.4029 123.25 28.3375 123.25 26V8.10355L123.27 8.08376L123.316 8.03779L123.361 7.99219L123.407 7.94695L123.451 7.90207L123.496 7.85754L123.54 7.81337L123.584 7.76956L123.627 7.7261L123.671 7.68299L123.713 7.64023L123.756 7.59782L123.798 7.55576L123.84 7.51405L123.881 7.47268L123.922 7.43165L123.963 7.39096L124.003 7.35062L124.043 7.31061L124.083 7.27094L124.122 7.23161L124.161 7.19261L124.2 7.15395L124.238 7.11562L124.276 7.07762L124.314 7.03994L124.351 7.0026L124.388 6.96558L124.425 6.92888L124.461 6.89251L124.497 6.85646L124.533 6.82074L124.568 6.78533L124.603 6.75023L124.638 6.71546L124.673 6.681L124.707 6.64685L124.741 6.61301L124.774 6.57949L124.807 6.54627L124.84 6.51336L124.873 6.48076L124.905 6.44846L124.937 6.41646L124.969 6.38477L125 6.35338L125.031 6.32228L125.062 6.29149L125.093 6.26099L125.123 6.23078L125.153 6.20087L125.182 6.17125L125.212 6.14192L125.241 6.11288L125.269 6.08413L125.298 6.05566L125.326 6.02748L125.354 5.99958L125.382 5.97196L125.409 5.94462L125.436 5.91756L125.463 5.89078L125.489 5.86428L125.516 5.83805L125.541 5.81209L125.567 5.7864L125.593 5.76099L125.618 5.73584L125.643 5.71097L125.667 5.68635L125.692 5.66201L125.716 5.63792L125.739 5.6141L125.763 5.59054L125.786 5.56723L125.809 5.54419L125.832 5.5214L125.855 5.49886L125.877 5.47658L125.899 5.45455L125.921 5.43277L125.942 5.41124L125.964 5.38996L125.985 5.36892L126.005 5.34813L126.026 5.32758L126.046 5.30727L126.066 5.2872L126.086 5.26737L126.106 5.24778L126.125 5.22843L126.144 5.20931L126.163 5.19042L126.182 5.17176L126.2 5.15334L126.218 5.13514L126.236 5.11717L126.254 5.09943L126.272 5.08191L126.289 5.06462L126.306 5.04754L126.323 5.03069L126.339 5.01406L126.356 4.99764L126.372 4.98144L126.388 4.96545L126.404 4.94968L126.419 4.93412L126.435 4.91877L126.45 4.90363L126.465 4.88869L126.48 4.87396L126.494 4.85944L126.508 4.84512L126.523 4.831L126.536 4.81708L126.55 4.80336L126.564 4.78983L126.577 4.77651L126.59 4.76338L126.603 4.75044L126.616 4.73769L126.628 4.72513L126.641 4.71276L126.653 4.70058L126.665 4.68859L126.677 4.67678L126.688 4.66515L126.7 4.6537L126.711 4.64244L126.722 4.63135L126.733 4.62044L126.744 4.60971L126.754 4.59915L126.765 4.58876L126.775 4.57855L126.785 4.56851L126.795 4.55863L126.805 4.54892L126.814 4.53938L126.824 4.53L126.833 4.52079L126.842 4.51174L126.851 4.50285L126.859 4.49411L126.868 4.48554L126.876 4.47712L126.885 4.46885L126.893 4.46074L126.901 4.45278L126.909 4.44497L126.916 4.4373L126.924 4.42979L126.931 4.42242L126.938 4.4152L126.945 4.40811L126.952 4.40117L126.959 4.39437L126.966 4.38771L126.972 4.38119L126.979 4.3748L126.985 4.36855L126.991 4.36243L126.997 4.35644L127.003 4.35058L127.009 4.34485L127.014 4.33925L127.02 4.33378L127.025 4.32842L127.03 4.3232L127.035 4.31809L127.04 4.3131L127.045 4.30823L127.05 4.30348L127.055 4.29885L127.059 4.29433L127.064 4.28992L127.068 4.28562L127.072 4.28144L127.076 4.27736L127.08 4.27339L127.084 4.26953L127.088 4.26577L127.091 4.26211L127.095 4.25855L127.098 4.2551L127.102 4.25174L127.105 4.24848L127.108 4.24532L127.111 4.24225L127.114 4.23928L127.117 4.23639L127.12 4.2336L127.123 4.23089L127.125 4.22828L127.128 4.22574L127.13 4.2233L127.133 4.22093L127.135 4.21865L127.137 4.21644L127.139 4.21432L127.141 4.21227L127.143 4.2103L127.145 4.2084L127.147 4.20658L127.149 4.20483L127.15 4.20314L127.152 4.20153L127.154 4.19998L127.155 4.1985L127.156 4.19709L127.158 4.19573L127.159 4.19444L127.16 4.19321L127.162 4.19204L127.163 4.19092L127.164 4.18986L127.165 4.18885L127.166 4.1879L127.167 4.187L127.167 4.18615L127.168 4.18534L127.169 4.18459L127.17 4.18388L127.17 4.18321L127.171 4.18259L127.172 4.18201L127.172 4.18147L127.173 4.18097L127.173 4.1805L127.173 4.18007L127.174 4.17968L127.174 4.17932L127.175 4.17898L127.175 4.17868L127.175 4.17841L127.175 4.17817L127.176 4.17795L127.176 4.17775L127.176 4.17758L127.176 4.17743L127.176 4.1773L127.176 4.17719L127.176 4.17709L127.177 4.17702L127.177 4.17695L127.177 4.1769L127.177 4.17686L127.177 4.17683L127.177 4.17681L127.177 4.17679L127.177 4.17678L127.177 4.17678L127.177 4.17677L127.177 4.17676L127.177 4.17675L127.177 4.17673L127.177 4.17669L127.177 4.17665L127.177 4.1766L127.177 4.17654L127.177 4.17646L127.177 4.17636L127.177 4.17625L127.177 4.17612L127.178 4.17597L127.178 4.1758L127.178 4.17561L127.178 4.17539L127.178 4.17514L127.179 4.17487L127.179 4.17457L127.179 4.17424L127.18 4.17388L127.18 4.17348L127.181 4.17305L127.181 4.17259L127.181 4.17208L127.182 4.17154L127.183 4.17096L127.183 4.17034L127.184 4.16967L127.185 4.16896L127.185 4.16821L127.186 4.16741L127.187 4.16655L127.188 4.16565L127.189 4.1647L127.19 4.16369L127.191 4.16263L127.192 4.16152L127.193 4.16034L127.194 4.15911L127.196 4.15782L127.197 4.15647L127.199 4.15505L127.2 4.15357L127.202 4.15202L127.203 4.15041L127.205 4.14873L127.207 4.14697L127.208 4.14515L127.21 4.14325L127.212 4.14128L127.214 4.13923L127.216 4.13711L127.219 4.13491L127.221 4.13262L127.223 4.13026L127.226 4.12781L127.228 4.12528L127.231 4.12266L127.234 4.11996L127.236 4.11716L127.239 4.11428L127.242 4.1113L127.245 4.10823L127.248 4.10507L127.252 4.10181L127.255 4.09845L127.259 4.095L127.262 4.09144L127.266 4.08779L127.27 4.08403L127.273 4.08016L127.277 4.07619L127.281 4.07212L127.286 4.06793L127.29 4.06363L127.294 4.05923L127.299 4.05471L127.303 4.05007L127.308 4.04532L127.313 4.04045L127.318 4.03547L127.323 4.03036L127.328 4.02513L127.334 4.01978L127.339 4.0143L127.345 4.0087L127.351 4.00297L127.356 3.99711L127.362 3.99112L127.369 3.985L127.375 3.97875L127.381 3.97236L127.388 3.96584L127.394 3.95918L127.401 3.95238L127.408 3.94544L127.415 3.93836L127.422 3.93113L127.43 3.92376L127.437 3.91625L127.445 3.90859L127.453 3.90078L127.461 3.89282L127.469 3.8847L127.477 3.87644L127.486 3.86802L127.494 3.85944L127.503 3.85071L127.512 3.84182L127.521 3.83276L127.53 3.82355L127.539 3.81417L127.549 3.80463L127.559 3.79492L127.569 3.78505L127.579 3.775L127.589 3.76479L127.599 3.7544L127.61 3.74384L127.62 3.73311L127.631 3.7222L127.642 3.71112L127.654 3.69985L127.665 3.6884L127.677 3.67678L127.689 3.66497L127.701 3.65297L127.713 3.64079L127.725 3.62842L127.738 3.61586L127.75 3.60312L127.763 3.59018L127.777 3.57705L127.79 3.56372L127.803 3.5502L127.817 3.53648L127.831 3.52256L127.845 3.50844L127.859 3.49412L127.874 3.47959L127.889 3.46486L127.904 3.44993L127.919 3.43479L127.934 3.41943L127.95 3.40387L127.965 3.3881L127.981 3.37211L127.998 3.35591L128.014 3.3395L128.031 3.32286L128.048 3.30601L128.065 3.28894L128.082 3.27164L128.099 3.25412L128.117 3.23638L128.135 3.21841L128.153 3.20021L128.172 3.18179L128.19 3.16313L128.209 3.14425L128.228 3.12513L128.248 3.10577L128.267 3.08618L128.287 3.06635L128.307 3.04628L128.328 3.02598L128.348 3.00543L128.369 2.98463L128.39 2.9636L128.411 2.94231L128.433 2.92078L128.455 2.899L128.477 2.87697L128.499 2.85469L128.521 2.83215L128.544 2.80937L128.567 2.78632L128.591 2.76302L128.614 2.73945L128.638 2.71563L128.662 2.69155L128.686 2.6672L128.711 2.64259L128.736 2.61771L128.761 2.59256L128.786 2.56715L128.812 2.54146L128.838 2.51551L128.864 2.48928L128.891 2.46277L128.918 2.43599L128.945 2.40893L128.972 2.3816L129 2.35398L129.027 2.32608L129.056 2.2979L129.084 2.26943L129.113 2.24067L129.142 2.21163L129.171 2.1823L129.201 2.15268L129.231 2.12277L129.261 2.09257L129.291 2.06207L129.322 2.03127L129.353 2.00017L129.385 1.96878L129.416 1.93709L129.448 1.90509L129.481 1.8728L129.513 1.84019L129.546 1.80728L129.579 1.77407L129.613 1.74054L129.647 1.7067L129.681 1.67256L129.715 1.6381L129.75 1.60332L129.785 1.56823L129.821 1.53282L129.856 1.49709L129.893 1.46104L129.929 1.42467L129.966 1.38797L130.003 1.35096L130.04 1.31361L130.078 1.27594L130.116 1.23794L130.154 1.1996L130.193 1.16094L130.232 1.12194L130.271 1.08261L130.311 1.04294L130.351 1.00294L130.391 0.962591L130.432 0.921906L130.473 0.880878L130.514 0.839508L130.556 0.797792L130.598 0.755731L130.64 0.713322L130.683 0.670563L130.726 0.627455L130.77 0.583994L130.813 0.54018L130.858 0.496011L130.902 0.451486L130.947 0.406604L130.992 0.361362L131.038 0.31576L131.084 0.269796Z" fill="#131313" stroke="#AA00FF" stroke-width="0.5"/>
</g>
<defs>
<clipPath id="clip0_5_21">
<rect width="214" height="36" fill="white" transform="matrix(-1 0 0 1 214 0)"/>
</clipPath>
<clipPath id="clip1_5_21">
<rect width="214" height="36" fill="white" transform="matrix(-1 0 0 1 214 0)"/>
</clipPath>
<clipPath id="clip2_5_21">
<rect width="214" height="36" fill="white" transform="translate(114)"/>
</clipPath>
</defs>
</svg>
`

    const tab = this.ui.createElement("div", { class: "tab" }, [
      this.ui.createElement("div", { class: "tab-dividers" }),
      this.ui.createElement("div", { class: "tab-background" }, [
        this.ui.createElement("svg", { width: "328", height: "36", viewBox: "0 0 328 36", fill: "none", version: "1.1", xmlns: "http://www.w3.org/2000/svg" }, [
          this.ui.createElement("g", {"clip-path": "url(#clip0_5_21)" }, [
            this.ui.createElement("g", {"clip-path": "url(#clip1_5_21)" }, [
              this.ui.createElement("path", {d:"M197 0.25H0.25V35.75H213.75V34.2465C211.522 34.1845 209.318 33.2987 207.65 31.8778C205.919 30.4029 204.75 28.3375 204.75 26V8C204.75 3.63807 201.362 0.25 197 0.25Z", fill:"#131313", stroke: "#AA00FF", "stroke-width": "0.5"})
            ])
          ]),
          this.ui.createElement("g", {"clip-path": "url(#clip2_5_21)"}, [
            this.ui.createElement("path", { d:"M131.084 0.269796L131.104 0.25H327.75V35.75H114.25V34.2465C116.478 34.1845 118.682 33.2987 120.35 31.8778C122.081 30.4029 123.25 28.3375 123.25 26V8.10355L123.27 8.08376L123.316 8.03779L123.361 7.99219L123.407 7.94695L123.451 7.90207L123.496 7.85754L123.54 7.81337L123.584 7.76956L123.627 7.7261L123.671 7.68299L123.713 7.64023L123.756 7.59782L123.798 7.55576L123.84 7.51405L123.881 7.47268L123.922 7.43165L123.963 7.39096L124.003 7.35062L124.043 7.31061L124.083 7.27094L124.122 7.23161L124.161 7.19261L124.2 7.15395L124.238 7.11562L124.276 7.07762L124.314 7.03994L124.351 7.0026L124.388 6.96558L124.425 6.92888L124.461 6.89251L124.497 6.85646L124.533 6.82074L124.568 6.78533L124.603 6.75023L124.638 6.71546L124.673 6.681L124.707 6.64685L124.741 6.61301L124.774 6.57949L124.807 6.54627L124.84 6.51336L124.873 6.48076L124.905 6.44846L124.937 6.41646L124.969 6.38477L125 6.35338L125.031 6.32228L125.062 6.29149L125.093 6.26099L125.123 6.23078L125.153 6.20087L125.182 6.17125L125.212 6.14192L125.241 6.11288L125.269 6.08413L125.298 6.05566L125.326 6.02748L125.354 5.99958L125.382 5.97196L125.409 5.94462L125.436 5.91756L125.463 5.89078L125.489 5.86428L125.516 5.83805L125.541 5.81209L125.567 5.7864L125.593 5.76099L125.618 5.73584L125.643 5.71097L125.667 5.68635L125.692 5.66201L125.716 5.63792L125.739 5.6141L125.763 5.59054L125.786 5.56723L125.809 5.54419L125.832 5.5214L125.855 5.49886L125.877 5.47658L125.899 5.45455L125.921 5.43277L125.942 5.41124L125.964 5.38996L125.985 5.36892L126.005 5.34813L126.026 5.32758L126.046 5.30727L126.066 5.2872L126.086 5.26737L126.106 5.24778L126.125 5.22843L126.144 5.20931L126.163 5.19042L126.182 5.17176L126.2 5.15334L126.218 5.13514L126.236 5.11717L126.254 5.09943L126.272 5.08191L126.289 5.06462L126.306 5.04754L126.323 5.03069L126.339 5.01406L126.356 4.99764L126.372 4.98144L126.388 4.96545L126.404 4.94968L126.419 4.93412L126.435 4.91877L126.45 4.90363L126.465 4.88869L126.48 4.87396L126.494 4.85944L126.508 4.84512L126.523 4.831L126.536 4.81708L126.55 4.80336L126.564 4.78983L126.577 4.77651L126.59 4.76338L126.603 4.75044L126.616 4.73769L126.628 4.72513L126.641 4.71276L126.653 4.70058L126.665 4.68859L126.677 4.67678L126.688 4.66515L126.7 4.6537L126.711 4.64244L126.722 4.63135L126.733 4.62044L126.744 4.60971L126.754 4.59915L126.765 4.58876L126.775 4.57855L126.785 4.56851L126.795 4.55863L126.805 4.54892L126.814 4.53938L126.824 4.53L126.833 4.52079L126.842 4.51174L126.851 4.50285L126.859 4.49411L126.868 4.48554L126.876 4.47712L126.885 4.46885L126.893 4.46074L126.901 4.45278L126.909 4.44497L126.916 4.4373L126.924 4.42979L126.931 4.42242L126.938 4.4152L126.945 4.40811L126.952 4.40117L126.959 4.39437L126.966 4.38771L126.972 4.38119L126.979 4.3748L126.985 4.36855L126.991 4.36243L126.997 4.35644L127.003 4.35058L127.009 4.34485L127.014 4.33925L127.02 4.33378L127.025 4.32842L127.03 4.3232L127.035 4.31809L127.04 4.3131L127.045 4.30823L127.05 4.30348L127.055 4.29885L127.059 4.29433L127.064 4.28992L127.068 4.28562L127.072 4.28144L127.076 4.27736L127.08 4.27339L127.084 4.26953L127.088 4.26577L127.091 4.26211L127.095 4.25855L127.098 4.2551L127.102 4.25174L127.105 4.24848L127.108 4.24532L127.111 4.24225L127.114 4.23928L127.117 4.23639L127.12 4.2336L127.123 4.23089L127.125 4.22828L127.128 4.22574L127.13 4.2233L127.133 4.22093L127.135 4.21865L127.137 4.21644L127.139 4.21432L127.141 4.21227L127.143 4.2103L127.145 4.2084L127.147 4.20658L127.149 4.20483L127.15 4.20314L127.152 4.20153L127.154 4.19998L127.155 4.1985L127.156 4.19709L127.158 4.19573L127.159 4.19444L127.16 4.19321L127.162 4.19204L127.163 4.19092L127.164 4.18986L127.165 4.18885L127.166 4.1879L127.167 4.187L127.167 4.18615L127.168 4.18534L127.169 4.18459L127.17 4.18388L127.17 4.18321L127.171 4.18259L127.172 4.18201L127.172 4.18147L127.173 4.18097L127.173 4.1805L127.173 4.18007L127.174 4.17968L127.174 4.17932L127.175 4.17898L127.175 4.17868L127.175 4.17841L127.175 4.17817L127.176 4.17795L127.176 4.17775L127.176 4.17758L127.176 4.17743L127.176 4.1773L127.176 4.17719L127.176 4.17709L127.177 4.17702L127.177 4.17695L127.177 4.1769L127.177 4.17686L127.177 4.17683L127.177 4.17681L127.177 4.17679L127.177 4.17678L127.177 4.17678L127.177 4.17677L127.177 4.17676L127.177 4.17675L127.177 4.17673L127.177 4.17669L127.177 4.17665L127.177 4.1766L127.177 4.17654L127.177 4.17646L127.177 4.17636L127.177 4.17625L127.177 4.17612L127.178 4.17597L127.178 4.1758L127.178 4.17561L127.178 4.17539L127.178 4.17514L127.179 4.17487L127.179 4.17457L127.179 4.17424L127.18 4.17388L127.18 4.17348L127.181 4.17305L127.181 4.17259L127.181 4.17208L127.182 4.17154L127.183 4.17096L127.183 4.17034L127.184 4.16967L127.185 4.16896L127.185 4.16821L127.186 4.16741L127.187 4.16655L127.188 4.16565L127.189 4.1647L127.19 4.16369L127.191 4.16263L127.192 4.16152L127.193 4.16034L127.194 4.15911L127.196 4.15782L127.197 4.15647L127.199 4.15505L127.2 4.15357L127.202 4.15202L127.203 4.15041L127.205 4.14873L127.207 4.14697L127.208 4.14515L127.21 4.14325L127.212 4.14128L127.214 4.13923L127.216 4.13711L127.219 4.13491L127.221 4.13262L127.223 4.13026L127.226 4.12781L127.228 4.12528L127.231 4.12266L127.234 4.11996L127.236 4.11716L127.239 4.11428L127.242 4.1113L127.245 4.10823L127.248 4.10507L127.252 4.10181L127.255 4.09845L127.259 4.095L127.262 4.09144L127.266 4.08779L127.27 4.08403L127.273 4.08016L127.277 4.07619L127.281 4.07212L127.286 4.06793L127.29 4.06363L127.294 4.05923L127.299 4.05471L127.303 4.05007L127.308 4.04532L127.313 4.04045L127.318 4.03547L127.323 4.03036L127.328 4.02513L127.334 4.01978L127.339 4.0143L127.345 4.0087L127.351 4.00297L127.356 3.99711L127.362 3.99112L127.369 3.985L127.375 3.97875L127.381 3.97236L127.388 3.96584L127.394 3.95918L127.401 3.95238L127.408 3.94544L127.415 3.93836L127.422 3.93113L127.43 3.92376L127.437 3.91625L127.445 3.90859L127.453 3.90078L127.461 3.89282L127.469 3.8847L127.477 3.87644L127.486 3.86802L127.494 3.85944L127.503 3.85071L127.512 3.84182L127.521 3.83276L127.53 3.82355L127.539 3.81417L127.549 3.80463L127.559 3.79492L127.569 3.78505L127.579 3.775L127.589 3.76479L127.599 3.7544L127.61 3.74384L127.62 3.73311L127.631 3.7222L127.642 3.71112L127.654 3.69985L127.665 3.6884L127.677 3.67678L127.689 3.66497L127.701 3.65297L127.713 3.64079L127.725 3.62842L127.738 3.61586L127.75 3.60312L127.763 3.59018L127.777 3.57705L127.79 3.56372L127.803 3.5502L127.817 3.53648L127.831 3.52256L127.845 3.50844L127.859 3.49412L127.874 3.47959L127.889 3.46486L127.904 3.44993L127.919 3.43479L127.934 3.41943L127.95 3.40387L127.965 3.3881L127.981 3.37211L127.998 3.35591L128.014 3.3395L128.031 3.32286L128.048 3.30601L128.065 3.28894L128.082 3.27164L128.099 3.25412L128.117 3.23638L128.135 3.21841L128.153 3.20021L128.172 3.18179L128.19 3.16313L128.209 3.14425L128.228 3.12513L128.248 3.10577L128.267 3.08618L128.287 3.06635L128.307 3.04628L128.328 3.02598L128.348 3.00543L128.369 2.98463L128.39 2.9636L128.411 2.94231L128.433 2.92078L128.455 2.899L128.477 2.87697L128.499 2.85469L128.521 2.83215L128.544 2.80937L128.567 2.78632L128.591 2.76302L128.614 2.73945L128.638 2.71563L128.662 2.69155L128.686 2.6672L128.711 2.64259L128.736 2.61771L128.761 2.59256L128.786 2.56715L128.812 2.54146L128.838 2.51551L128.864 2.48928L128.891 2.46277L128.918 2.43599L128.945 2.40893L128.972 2.3816L129 2.35398L129.027 2.32608L129.056 2.2979L129.084 2.26943L129.113 2.24067L129.142 2.21163L129.171 2.1823L129.201 2.15268L129.231 2.12277L129.261 2.09257L129.291 2.06207L129.322 2.03127L129.353 2.00017L129.385 1.96878L129.416 1.93709L129.448 1.90509L129.481 1.8728L129.513 1.84019L129.546 1.80728L129.579 1.77407L129.613 1.74054L129.647 1.7067L129.681 1.67256L129.715 1.6381L129.75 1.60332L129.785 1.56823L129.821 1.53282L129.856 1.49709L129.893 1.46104L129.929 1.42467L129.966 1.38797L130.003 1.35096L130.04 1.31361L130.078 1.27594L130.116 1.23794L130.154 1.1996L130.193 1.16094L130.232 1.12194L130.271 1.08261L130.311 1.04294L130.351 1.00294L130.391 0.962591L130.432 0.921906L130.473 0.880878L130.514 0.839508L130.556 0.797792L130.598 0.755731L130.64 0.713322L130.683 0.670563L130.726 0.627455L130.77 0.583994L130.813 0.54018L130.858 0.496011L130.902 0.451486L130.947 0.406604L130.992 0.361362L131.038 0.31576L131.084 0.269796Z", fill:"#131313", stroke:"#AA00FF", "stroke-width":"0.5"})
          ]),
          this.ui.createElement("defs", {}, [
            this.ui.createElement("clipPath", {id: "clip0_5_21"}, [
              this.ui.createElement("rect", {width:"214", height:"36", fill:"white", transform:"matrix(-1 0 0 1 214 0)"})
            ]),
            this.ui.createElement("clipPath", {id: "clip1_5_21"}, [
              this.ui.createElement("rect", {width:"214", height:"36", fill:"white", transform:"matrix(-1 0 0 1 214 0)"})
            ]),
            this.ui.createElement("clipPath", {id: "clip2_5_21"}, [
              this.ui.createElement("rect", {width:"214", height:"36", fill:"white", transform:"translate(114)"})
            ])
          ])
        ])
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