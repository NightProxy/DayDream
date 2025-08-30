import "../css/vars.css";
import "../css/imports.css";
import "../css/global.css";
import "basecoat-css/all";

import { Nightmare } from "@libs/Nightmare/nightmare";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { ProfilesAPI } from "@apis/profiles";
import { Logger } from "@apis/logging";
import { Proxy } from "@apis/proxy";
import { Windowing } from "@browser/windowing";
import { DDXGlobal } from "@js/global/index";
import { Render } from "@browser/render";
import { Items } from "@browser/items";
import { Protocols } from "@browser/protocols";
import { Utils } from "@js/utils";
import { Tabs } from "@browser/tabs";
import { Functions } from "@browser/functions";
import { Search } from "@browser/search";
import { universalTheme } from "@js/global/universalTheme";

// @ts-ignore
const { ScramjetController } = $scramjetLoadController();

document.addEventListener("DOMContentLoaded", async () => {
  await universalTheme.init();

  const nightmare = new Nightmare();
  const nightmarePlugins = new NightmarePlugins();

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();
  const profilesAPI = new ProfilesAPI();
  const loggingAPI = new Logger();

  const proxy = new Proxy();

  const proxySetting = (await settingsAPI.getItem("proxy")) ?? "sj";
  let swConfigSettings: Record<string, any> = {};
  const swConfig = {
    uv: {
      type: "sw",
      file: "/data/sw.js",
      config: window.__uv$config,
      func: null,
    },
    sj: {
      type: "sw",
      file: "/assets/sw.js",
      config: window.__scramjet$config,
      func: async () => {
        if ((await settingsAPI.getItem("scramjet")) != "fixed") {
          const scramjet = new ScramjetController(window.__scramjet$config);
          scramjet.init().then(async () => {
            await proxy.setTransports();
          });
        } else {
          const scramjet = new ScramjetController(window.__scramjet$config);
          scramjet.init().then(async () => {
            await proxy.setTransports();
          });

          console.log("Scramjet Service Worker registered.");
        }
      },
    },
    auto: {
      type: "multi",
      file: null,
      config: null,
      func: null,
    },
  };

  const render = new Render(
    document.getElementById("browser-container") as HTMLDivElement,
  );

  setTimeout(() => {
    const theming = universalTheme.getTheming();
    theming.applyTheme(theming.currentTheme);
  }, 100);

  const proto = new Protocols(swConfig, proxySetting);
  const windowing = new Windowing();
  const globalFunctions = new DDXGlobal();
  const items = new Items();
  const utils = new Utils();
  const tabs = new Tabs(render, proto, swConfig, proxySetting);

  tabs.createTab("ddx://newtab/");

  const functions = new Functions(tabs, proto);

  if (
    proxySetting === "sj" &&
    swConfig[proxySetting as keyof typeof swConfig] &&
    typeof swConfig[proxySetting as keyof typeof swConfig].func === "function"
  ) {
    await (swConfig[proxySetting as keyof typeof swConfig].func as Function)();
  }

  proxy
    .registerSW(swConfig[proxySetting as keyof typeof swConfig])
    .then(async () => {
      await proxy.setTransports().then(async () => {
        const transport = await proxy.connection.getTransport();
        if (transport == null) {
          proxy.setTransports();
        }
      });
    });
  const uvSearchBar = items.addressBar;

  uvSearchBar!.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const searchValue = uvSearchBar!.value.trim();

      if (searchValue.startsWith("ddx://")) {
        const url = (await proto.processUrl(searchValue)) || "/internal/error/";
        const iframe = items.frameContainer!.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;
        iframe!.setAttribute("src", url);
      } else {
        if (proxySetting === "auto") {
          const result = (await proxy.automatic(
            proxy.search(searchValue),
            swConfig,
          )) as Record<string, any>;
          swConfigSettings = result;
          window.SWSettings = swConfigSettings;
        } else {
          swConfigSettings = swConfig[proxySetting as keyof typeof swConfig];
          window.SWSettings = swConfigSettings;
        }

        if (
          proxySetting === "sj" &&
          swConfigSettings &&
          typeof swConfigSettings.func === "function"
        ) {
          await swConfigSettings.func();
        }

        await proxy.registerSW(swConfigSettings).then(async () => {
          await proxy.setTransports();
        });

        if (swConfigSettings && typeof swConfigSettings.func === "function") {
          swConfigSettings.func();
        }

        if (swConfigSettings && swConfigSettings.type) {
          switch (swConfigSettings.type) {
            case "sw":
              let encodedUrl;
              if (proxySetting == "dy") {
                encodedUrl =
                  swConfigSettings.config.prefix +
                  "route?url=" +
                  window.__uv$config.encodeUrl(proxy.search(searchValue));
              } else {
                encodedUrl =
                  swConfigSettings.config.prefix +
                  window.__uv$config.encodeUrl(proxy.search(searchValue));
              }
              const activeIframe = document.querySelector(
                "iframe.active",
              ) as HTMLIFrameElement;
              if (activeIframe) {
                activeIframe.src = encodedUrl;
              }
              if (!activeIframe) {
                tabs.createTab(location.origin + encodedUrl);
              }
              break;
          }
        }
      }
    }
  });

  functions.init();

  const searchbar = new Search(proxy, swConfig, proxySetting, proto);
  if (items.addressBar) {
    await searchbar.init(items.addressBar);
  }

  window.nightmare = nightmare;
  window.nightmarePlugins = nightmarePlugins;
  window.settings = settingsAPI;
  window.eventsAPI = eventsAPI;
  window.protocols = proto;
  window.proxy = proxy;
  window.logging = loggingAPI;
  window.profiles = profilesAPI;
  window.globals = globalFunctions;
  window.renderer = render;
  window.items = items;
  window.utils = utils;
  window.tabs = tabs;
  window.windowing = windowing;
  window.functions = functions;
  window.searchbar = searchbar;
  window.SWconfig = swConfig;
  window.ProxySettings = proxySetting;
});
