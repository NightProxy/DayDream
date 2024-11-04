class Functions {
  constructor(items, ui, tabs, dataApi, nightmarePlugins) {
    this.items = items;
    this.ui = ui;
    this.tabs = tabs;
    this.dataApi = dataApi;
    this.nightmarePlugins = nightmarePlugins;
    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
  }
  init() {
    this.items.toggleTabsButton.addEventListener("click", () => {
      this.toggleTabs();
    });
    this.items.backButton.addEventListener("click", () => {
      this.backward();
    });
    this.items.reloadButton.addEventListener("click", () => {
      this.refresh();
    });
    this.items.forwardButton.addEventListener("click", () => {
      this.forward();
    });

    this.extras();

    this.items.newTab.addEventListener("click", () =>
      this.tabs.createTab("daydream://newtab"),
    );
  }

  toggleTabs() {
    if (localStorage.getItem('verticalTabs') === 'true') {
      const tabs = document.querySelector('.tabs');
      const viewport = document.querySelector('.viewport');
      const isDisabled = tabs.classList.toggle('hidden');

      if (isDisabled) {
        tabs.classList.add('hidden');
        viewport.classList.add('hidden')
      } else {
        tabs.classList.remove('hidden');
        viewport.classList.remove('hidden')
      }

      // Save the current state to localStorage
      localStorage.setItem('verticalTabs-notshowing', isDisabled);
    } else {
      return;
    }
  }

  backward() {
    this.items.iframeContainer.querySelector("iframe.active").contentWindow.history.back();
    this.dataApi.logger.createLog(`Navigated back to ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`);
  }

  forward() {
    this.items.iframeContainer.querySelector("iframe.active").contentWindow.history.forward();
    this.dataApi.logger.createLog(`Navigated forward to ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`);
  }

  refresh() {
    this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.reload();
    this.dataApi.logger.createLog(`Reloaded page ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`);
  }

  injectErudaScript(iframeDocument) {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve();
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn("Eruda script is already being injected.");
        resolve();
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.src = "/assets/js/lib/eruda/eruda.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve();
      };
      script.onerror = (event) => {
        this.erudaScriptInjecting = false;
        reject(new Error("Failed to load Eruda script:", event));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument) {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
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
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.hide();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }
  inspectElement() {
    const iframe = this.items.iframeContainer.querySelector("iframe.active");
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (iframe.contentWindow.location.href.includes(forbiddenSrcs)) {
      console.warn("Iframe src is forbidden, skipping.");
      return;
    }

    if (iframe.contentWindow.document.readyState == "loading") {
      console.warn(
        "Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck.",
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
      .catch((error) => {
        console.error("Error injecting Eruda script:", error);
      });

    iframe.contentWindow.addEventListener("unload", () => {
      this.devToggle = false;
      this.erudaScriptLoaded = false;
      this.erudaScriptInjecting = false;
      console.log("Iframe navigation detected, Eruda toggle reset.");
    });
    this.dataApi.loggger.createLog("Toggled Inspect Element")
  }

  extras() {
    this.extrasMenu(this.items.extrasButton);
  }

  extrasMenu(button) {
    let content = this.ui.createElement("div", {}, [
      this.ui.createElement("div", { class: "menu-item", id: "openNewTab" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["tab"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Open New Tab"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + T"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "openNewWindow" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["open_in_new"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Open a New Window"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + N"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "openNewABWindow" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["visibility_off"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Open an Incognito Window"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + Shift + N"])
      ]),
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, ["Zoom"]),
        this.ui.createElement("div", { class: "menu-item", id: "zoom-out" }, [
          this.ui.createElement("span", { class: "material-symbols-outlined" }, ["remove"]),
        ]),
        this.ui.createElement("span", { class: "menu-label", id: "zoom-percentage" }, ["100%"]),
        this.ui.createElement("div", { class: "menu-item", id: "zoom-in" }, [
          this.ui.createElement("span", { class: "material-symbols-outlined" }, ["add"])
        ]),
        this.ui.createElement("div", { class: "menu-item", id: "fullscreen" }, [
          this.ui.createElement("span", { class: "material-symbols-outlined" }, ["open_in_full"])
        ]),
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "openBookmarks" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["hotel_class"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Bookmarks"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + Shift + B"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "openGames" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["playing_cards"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Games"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + Shift + G"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "openExtensions" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["extension"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Extensions"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + Shift + E"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "screenshot" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["screenshot"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Screenshot"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + C"])
      ]),
      this.ui.createElement("div", { class: "menu-item", id: "inspectElement" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["code"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Inspect Element"]),
        this.ui.createElement("span", { class: "menu-key" }, ["Alt + Shift + I"])
      ]),
    ])
    this.nightmarePlugins.sidemenu.attachTo(button, content);
    setTimeout(() => {
      this.extrasMenuFunctions();
    }, 50);
  }

  extrasMenuFunctions() {
    if (document.querySelector(".menu-container") != null) {
      console.log("Menu container found");
      const openNewTab = document.getElementById("openNewTab");
      const openNewWindow = document.getElementById("openNewWindow");
      const openNewABWindow = document.getElementById("openNewABWindow");
      const zoomOut = document.getElementById("zoom-out");
      const zoomIn = document.getElementById("zoom-in");
      const fullscreen = document.getElementById("fullscreen");
      const openBookmarks = document.getElementById("openBookmarks");
      const openGames = document.getElementById("openGames");
      const openExtensions = document.getElementById("openExtensions");
      const screenshot = document.getElementById("screenshot");
      const inspectElement = document.getElementById("inspectElement");

      openNewTab.addEventListener("click", () => {
        this.tabs.createTab("daydream://newtab");
      });

      openNewWindow.addEventListener("click", () => {
        console.log("Opening new window");
      });

      openNewABWindow.addEventListener("click", () => {
        console.log("Opening new incognito window");
      });

      zoomOut.addEventListener("click", () => {
        console.log("Zooming out");
      });

      zoomIn.addEventListener("click", () => {
        console.log("Zooming in");
      });

      fullscreen.addEventListener("click", () => {
        console.log("Fullscreen");
      });

      openBookmarks.addEventListener("click", () => {
        console.log("Opening bookmarks");
      });

      openGames.addEventListener("click", () => {
        console.log("Opening games");
      });

      openExtensions.addEventListener("click", () => {
        console.log("Opening extensions");
      });

      screenshot.addEventListener("click", () => {
        console.log("Taking screenshot");
      });

      inspectElement.addEventListener("click", () => {
        this.inspectElement();
      });
    }
  }

}
