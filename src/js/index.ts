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
import { Tabs } from "@browser/tabs";
import { Functions } from "@browser/functions";
import { Search } from "@browser/search";
import { universalTheme } from "@js/global/universalTheme";
import { checkNightPlusStatus } from "@apis/nightplus";
import { initClipboardDeobfuscator } from "@js/utils/clipboardDeobfuscator";

// @ts-ignore
const { ScramjetController } = $scramjetLoadController();

document.addEventListener("DOMContentLoaded", async () => {
  await universalTheme.init();

  setTimeout(() => {
    initClipboardDeobfuscator({ debug: false });
  }, 500);

  const nightmare = new Nightmare();
  const nightmarePlugins = new NightmarePlugins();

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();

  const profilesAPI = new ProfilesAPI(checkNightPlusStatus, 3);
  await profilesAPI.initPromise;

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
        const scramjet = new ScramjetController(window.__scramjet$config);
        scramjet.init().then(async () => {
          await proxy.setTransports();
        });
        console.log("Scramjet Service Worker registered.");
      },
    },
    auto: {
      type: "multi",
      file: null,
      config: null,
      func: null,
    },
  };

  const container: HTMLDivElement | null = document.getElementById(
    "browser-container",
  ) as HTMLDivElement;

  const render = new Render(container);

  setTimeout(() => {
    const theming = universalTheme.getTheming();
    theming.applyTheme(theming.currentTheme);
  }, 100);

  const proto = new Protocols(swConfig, proxySetting, proxy);
  const windowing = new Windowing();
  const globalFunctions = new DDXGlobal();
  const items = new Items();
  const tabs = new Tabs(render, proto, swConfig, proxySetting, items, proxy);

  window.tabs = tabs;
  window.protocols = proto;
  window.windowing = windowing;
  window.items = items;
  window.eventsAPI = eventsAPI;
  window.settings = settingsAPI;
  window.proxy = proxy;

  tabs.createTab("ddx://newtab/");

  const functions = new Functions(tabs, proto);
  await functions.initPromise;
  functions.init();

  if (
    proxySetting === "sj" &&
    swConfig[proxySetting as keyof typeof swConfig] &&
    typeof swConfig[proxySetting as keyof typeof swConfig].func === "function"
  ) {
    await (swConfig[proxySetting as keyof typeof swConfig].func as Function)();
  }

  await proxy.registerSW(swConfig[proxySetting as keyof typeof swConfig]);
  await proxy.setTransports();
  const transport = await proxy.connection.getTransport();
  if (transport == null) {
    await proxy.setTransports();
  }
  const uvSearchBar = items.addressBar;

  uvSearchBar!.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const searchValue = uvSearchBar!.value.trim();

      if (proto.isRegisteredProtocol(searchValue)) {
        const url = (await proto.processUrl(searchValue)) || "/internal/error/";
        const iframe = items.frameContainer!.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;
        
        if (iframe) {
          iframe.setAttribute("src", url);
        } else {
          console.warn("No active iframe found for navigation");
        }
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
          await swConfigSettings.func() as Function;
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
              let encodedUrl =
                  swConfigSettings.config.prefix +
                  window.__uv$config.encodeUrl(proxy.search(searchValue));
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

  const searchbar = new Search(proxy, swConfig, proxySetting, proto);
  if (items.addressBar) {
    await searchbar.init(items.addressBar);
  }

  window.nightmare = nightmare;
  window.nightmarePlugins = nightmarePlugins;
  window.logging = loggingAPI;
  window.profiles = profilesAPI;
  window.globals = globalFunctions;
  window.renderer = render;
  window.functions = functions;
  window.searchbar = searchbar;
  window.SWconfig = swConfig;
  window.ProxySettings = proxySetting;
});
