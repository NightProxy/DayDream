import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { Protocols } from "@browser/protocols";
import { Utils } from "@js/utils";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";

interface FuncInterface {
  tabs: any;
  items: Items;
  ui: UI;
  logger: Logger;
  settings: SettingsAPI;
  proto: Protocols;
  utils: Utils;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;
  devToggle: boolean;

  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;
}
class Functions implements FuncInterface {
  tabs: any;
  items: Items;
  ui: UI;
  logger: Logger;
  settings: SettingsAPI;
  proto: Protocols;
  utils: Utils;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;
  devToggle: boolean;
  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;
  constructor(tabs: any, proto: any) {
    this.items = new Items();
    this.ui = new UI();
    this.tabs = tabs!;
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.proto = proto;
    this.utils = new Utils();
    this.nightmarePlugins = new NightmarePlugins();
    this.windowing = new Windowing();
    this.events = new EventSystem();
    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
    this.zoomLevel = 1;
    this.zoomSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this.currentStep = 4;
  }

  init() {
    this.items.backButton!.addEventListener("click", () => {
      this.backward();
    });
    this.items.reloadButton!.addEventListener("click", () => {
      this.refresh();
    });
    this.items.forwardButton!.addEventListener("click", () => {
      this.forward();
    });

    this.menus();
    //this.navbarfunctions();

    this.items.newTab!.addEventListener(
      "click",
      async () => await this.tabs.createTab("daydream://newtab", false),
    );
  }

  backward() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.back();
  }

  forward() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.forward();
  }

  refresh() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    iframe?.contentWindow?.location.reload();
  }

  zoomIn() {
    if (this.currentStep < this.zoomSteps.length - 1) {
      this.currentStep++;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  zoomOut() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  scaleIframeContent() {
    let iframe: HTMLIFrameElement | null;
    iframe = document.querySelector("iframe.active");
    if (iframe) {
      const iframeDoc =
        iframe?.contentDocument || iframe?.contentWindow?.document;
      iframeDoc!.body.style.transform = `scale(${this.zoomLevel})`;
      iframeDoc!.body.style.transformOrigin = "top left";
      iframeDoc!.body.style.overflow = "auto";
    }
  }

  injectErudaScript(iframeDocument: Document): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve("Loaded!");
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn("Eruda script is already being injected.");
        resolve("Already Injecting!");
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.src = location.origin + "/core/inspect.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve("Injected!");
      };
      script.onerror = (event: Event | string) => {
        this.erudaScriptInjecting = false;
        reject(new Error(`Failed to load Eruda script: ${event}`));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.init({
				defaults: {
					displaySize: 50,
					transparency: 0.65,
					theme: 'Night Owl'
				}
			});
			eruda.show();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  injectHideScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.hide();
      eruda.destroy();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }
  inspectElement() {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (forbiddenSrcs.includes(iframe.contentWindow.location.href)) {
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
    this.logger.createLog("Toggled Inspect Element");
  }

  menus() {
    const menuBtn = this.items.extrasButton;
    const menuPopup = this.items.menuContent;
    if (menuBtn && menuPopup) {
      menuPopup.style.transition = "opacity .18s ease, transform .18s ease";
      const openMenu = () => {
        menuPopup.style.pointerEvents = "auto";
        menuPopup.style.opacity = "1";
        menuPopup.style.transform = "scale(1)";
        menuPopup.style.zIndex = "99999999";
        menuPopup.style.willChange = "opacity, transform";
      };
      const closeMenu = () => {
        menuPopup.style.opacity = "0";
        menuPopup.style.transform = "scale(.95)";
        setTimeout(() => {
          menuPopup.style.pointerEvents = "none";
        }, 180);
      };
      closeMenu();
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = menuPopup.style.opacity === "1";
        open ? closeMenu() : openMenu();
      });
      document.addEventListener("click", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });

      document.addEventListener("ddx:page.clicked", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });
    }
  }

  goFullscreen() {
    const iframe = document.querySelector("iframe.active") as HTMLIFrameElement;

    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if ((iframe as any).mozRequestFullScreen) {
      (iframe as any).mozRequestFullScreen();
    } else if ((iframe as any).webkitRequestFullscreen) {
      (iframe as any).webkitRequestFullscreen();
    } else if ((iframe as any).msRequestFullscreen) {
      (iframe as any).msRequestFullscreen();
    }
  }

  extensionsMenu(button: HTMLButtonElement) {
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
                ["refresh"],
              ),
            ],
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
                ["settings"],
              ),
            ],
          ),
        ]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content, 300);
  }

  profilesMenu(button: HTMLButtonElement) {
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
            [this.ui.createElement("i", { "data-lucide": "user-plus" }, [])],
          ),
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "extensionsSettings",
              onclick: async () => {
                const url =
                  (await this.proto.processUrl("daydream://extensions")) ||
                  "/internal/error/";
                const iframe = this.items.frameContainer!.querySelector(
                  "iframe.active",
                ) as HTMLIFrameElement | null;
                iframe!.setAttribute("src", url);
              },
            },
            [this.ui.createElement("i", { "data-lucide": "user-pen" }, [])],
          ),
        ]),
      ]),
    ]);
    this.nightmarePlugins.sidemenu.attachTo(button, content, 50);
  }

  navbarfunctions() {
    const navbar = document.querySelector(".navbar");
    const games = navbar!.querySelector("#gamesShortcut");
    const chat = navbar!.querySelector("#chatShortcut") as HTMLButtonElement;
    const history = navbar!.querySelector("#historyShortcut");
    // const github = navbar!.querySelector("#gitShortcut");
    const settings = navbar!.querySelector("#settShortcut");

    games!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://games")) || "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    chat!.addEventListener("click", async () => {
      window.open("https://discord.night-x.com", "_blank");
    });

    history!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://history")) ||
        "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    /*github!.addEventListener("click", async () => {
      window.open("https://github.com/NightProxy/DayDreamX", "_blank");
    });*/

    settings!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("daydream://settings")) ||
        "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });
  }
}

export { Functions };
