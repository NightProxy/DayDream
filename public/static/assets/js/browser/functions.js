class Functions {
  constructor(
    items,
    ui,
    tabs,
    logger,
    settings,
    utils,
    nightmarePlugins,
    windowing,
    eventsAPI,
    extensionsAPI
  ) {
    this.items = items;
    this.ui = ui;
    this.tabs = tabs;
    this.logger = logger;
    this.settings = settings;
    this.utils = utils;
    this.nightmarePlugins = nightmarePlugins;
    this.windowing = windowing;
    this.events = eventsAPI;
    this.extensions = extensionsAPI;
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

    this.menus();
    this.navbarfunctions();

    this.items.newTab.addEventListener("click", () =>
      this.tabs.createTab("daydream://newtab")
    );
  }

  async toggleTabs() {
    if ((await this.settings.getItem("verticalTabs")) != "false") {
      const tabs = document.querySelector(".tabs");
      const viewport = document.querySelector(".viewport");
      const isDisabled = tabs.classList.toggle("hidden");

      if (isDisabled) {
        tabs.classList.add("hidden");
        viewport.classList.add("hidden");
      } else {
        tabs.classList.remove("hidden");
        viewport.classList.remove("hidden");
      }

      let val;
        if (isDisabled) {
          val = "true";
        } else {
          val = "false";
        }

      await this.settings.setItem("verticalTabs-notshowing", val);
    } else {
      return;
    }
  }

  backward() {
    this.items.iframeContainer
      .querySelector("iframe.active")
      .contentWindow.history.back();
    this.logger.createLog(
      `Navigated back to ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`
    );
  }

  forward() {
    this.items.iframeContainer
      .querySelector("iframe.active")
      .contentWindow.history.forward();
    this.logger.createLog(
      `Navigated forward to ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`
    );
  }

  refresh() {
    this.items.iframeContainer
      .querySelector("iframe.active")
      .contentWindow.location.reload();
    this.logger.createLog(
      `Reloaded page ${this.items.iframeContainer.querySelector("iframe.active").contentWindow.location.href}`
    );
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
      script.src = location.origin + "/assets/js/lib/eruda/eruda.js";
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
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)"
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
        "Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck."
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
    this.logger.loggger.createLog("Toggled Inspect Element");
  }

  menus() {
    this.extrasMenu(this.items.extrasButton);
    this.extensionsMenu(this.items.extensionsButton);
    this.profilesMenu(this.items.profilesButton)
  }

  goFullscreen() {
    const iframe = document.querySelector("iframe.active");

    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if (iframe.mozRequestFullScreen) {
      iframe.mozRequestFullScreen();
    } else if (iframe.webkitRequestFullscreen) {
      iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
      iframe.msRequestFullscreen();
    }
  }

  extrasMenu(button) {
    let content = this.ui.createElement("div", {}, [
      //New Tab
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openNewTab",
          onclick: () => {
            this.tabs.createTab("daydream://newtab");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["tab"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Open New Tab",
          ]),
          this.ui.createElement("span", { class: "menu-key" }, ["Alt + T"]),
        ]
      ),
      //New Window
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openNewWindow",
          onclick: () => {
            this.windowing.newWindow();
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["open_in_new"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Open New Window",
          ]),
          this.ui.createElement("span", { class: "menu-key" }, ["Alt + N"]),
        ]
      ),
      //New Incognito Window
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openNewABWindow",
          onclick: () => {
            this.windowing.aboutBlankWindow();
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["visibility_off"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Open About:Blank Window",
          ]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + N",
          ]),
        ]
      ),
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, ["Zoom"]),
        // Zoom Out
        this.ui.createElement(
          "div",
          {
            class: "menu-item",
            id: "zoom-out",
            onclick: () => {
              this.tabs.createTab("daydream://newtab");
            },
          },
          [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["remove"]
            ),
          ]
        ),
        this.ui.createElement(
          "span",
          { class: "menu-label", id: "zoom-percentage" },
          ["100%"]
        ),
        //Zoom In
        this.ui.createElement(
          "div",
          {
            class: "menu-item",
            id: "zoom-in",
            onclick: () => {
              this.tabs.createTab("daydream://newtab");
            },
          },
          [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["add"]
            ),
          ]
        ),
        // Fullscreen
        this.ui.createElement(
          "div",
          {
            class: "menu-item",
            id: "fullscreen",
            onclick: () => {
              this.goFullscreen();
            },
          },
          [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["open_in_full"]
            ),
          ]
        ),
      ]),
      // Bookmarks
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openBookmarks",
          onclick: () => {
            alert("disabled while in repair");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["hotel_class"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, ["Bookmarks"]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + B",
          ]),
        ]
      ),
      // History
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openHistory",
          onclick: () => {
            this.tabs.createTab("daydream://history");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["history"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, ["History"]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + Y",
          ]),
        ]
      ),
      // Games
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openGames",
          onclick: () => {
            this.tabs.createTab("daydream://games");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["playing_cards"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, ["Games"]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + G",
          ]),
        ]
      ),
      // Extensions
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "openExtensions",
          onclick: () => {
            this.tabs.createTab("daydream://extensions");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["extension"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Extensions (Soon)",
          ]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + E",
          ]),
        ]
      ),
      //Inspect Element
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "inspectElement",
          onclick: () => {
            this.inspectElement();
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["code"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Inspect Element",
          ]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + I",
          ]),
        ]
      ),
      // Settings
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          id: "settingsFromMenu",
          onclick: () => {
            this.tabs.createTab("daydream://settings");
          },
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["settings"]
          ),
          this.ui.createElement("span", { class: "menu-label" }, ["Settings"]),
          this.ui.createElement("span", { class: "menu-key" }, [
            "Alt + Shift + ,",
          ]),
        ]
      ),
      this.ui.createElement("div", { class: "menu-item" }, [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, ["logout"]),
        this.ui.createElement("span", { class: "menu-label" }, ["Panic"]),
        this.ui.createElement("span", { class: "menu-key", id: "panic-keybind" }, ["~"]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content);
  }

  extensionsMenu(button) {
    let extensionsList = [];

    let content = this.ui.createElement("div", {}, [
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, [
          "Extensions (SOON)",
        ]),
        this.ui.createElement("div", { class: "menu-right" }, [
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "reloadExtensions",
              onclick: () => {
                console.log("Reloading extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["refresh"]
              ),
            ]
          ),
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "extensionsSettings",
              onclick: () => {
                console.log("Disabling all extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["settings"]
              ),
            ]
          ),
        ]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content);
  }

  profilesMenu(button) {
    let content = this.ui.createElement("div", {}, [
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, [
          "Profiles (SOON)",
        ]),
        this.ui.createElement("div", { class: "menu-right" }, [
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "addProfile",
              onclick: () => {
                console.log("Adding Profile");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["person_add"]
              ),
            ]
          ),
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "extensionsSettings",
              onclick: () => {
                console.log("Disabling all extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["settings"]
              ),
            ]
          ),
        ]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content);
  }

  navbarfunctions() {
    const navbar = document.querySelector(".navbar");
    const games = navbar.querySelector("#gamesShortcut");
    const ai = navbar.querySelector("#aiShortcut");
    const chat = navbar.querySelector("#chatShortcut");
    const music = navbar.querySelector("#musicShortcut");
    const history = navbar.querySelector("#historyShortcut");
    const settings = navbar.querySelector("#settShortcut");

    games.addEventListener("click", () => {
      this.utils.navigate("daydream://games");
    });

    ai.addEventListener("click", () => {
      alert("This feature is coming soon!");
    });

    const content = this.ui.createElement(
      "iframe",
      { class: "news", src: "https://night-network.changelogfy.com/" },
      []
    );
    this.nightmarePlugins.sidepanel.attachTo(chat, content);

    music.addEventListener("click", () => {
      console.log("opening music");
    });

    history.addEventListener("click", () => {
      this.utils.navigate("daydream://history");
    });

    settings.addEventListener("click", () => {
      this.utils.navigate("daydream://settings");
    });
  }
}
