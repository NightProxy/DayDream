import { Nightmare } from "/assets/js/lib/Nightmare/nightmare.js";
import { NightmarePlugins } from "/assets/js/browser/nightmarePlugins.js";
import { SettingsAPI } from "/assets/js/apis/settings.js";
import { EventSystem } from "/assets/js/apis/events.js";
import { ProfilesAPI } from "/assets/js/apis/profiles.js";
import { Logger } from "/assets/js/apis/logging.js";
import { ExtensionsAPI } from "/assets/js/apis/extensions.js";
import { Proxy } from "/assets/js/apis/proxy.js";
import { Windowing } from "/assets/js/browser/windowing.js";
import { Global } from "/assets/js/global/index.js";
import { Render } from "/assets/js/browser/render.js";
import { Items } from "/assets/js/browser/items.js";
import { Utils } from "/assets/js/utils.js";
import { Tabs } from "/assets/js/browser/tabs.js";
import { Functions } from "/assets/js/browser/functions.js";
import { Keys } from "/assets/js/browser/keys.js";
import { Search } from "/assets/js/browser/search.js";

document.addEventListener("DOMContentLoaded", async () => {
  const nightmare = new Nightmare();
  const nightmarePlugins = new NightmarePlugins(nightmare);

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();
  const profilesAPI = new ProfilesAPI();
  const loggingAPI = new Logger();
  const extensionsAPI = new ExtensionsAPI();

  profilesAPI.init();

  await extensionsAPI.registerSW();
  await extensionsAPI.loadExtensions();

  var defWisp =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  var wispUrl = (await settingsAPI.getItem("wisp")) || defWisp;
  var searchVAR =
    (await settingsAPI.getItem("search")) || "https://www.duckduckgo.com/?q=%s";
  var transVAR = (await settingsAPI.getItem("transports")) || "libcurl";
  const proxy = new Proxy(searchVAR, transVAR, wispUrl, loggingAPI);

  const proxySetting = (await settingsAPI.getItem("proxy")) ?? "uv";
  let swConfigSettings = {};
  const swConfig = {
    uv: {
      type: "sw",
      file: "/@/sw.js",
      config: __uv$config,
      func: null,
    },
    sj: {
      type: "sw",
      file: "/$/sw.js",
      config: __scramjet$config,
      func: async () => {
        if ((await settingsAPI.getItem("scramjet")) != "fixed") {
          const scramjet = new ScramjetController(__scramjet$config);
          scramjet.init("/$/sw.js").then(async () => {
            await proxy.setTransports();
          });
          await settingsAPI.setItem("scramjet", "fixed");
        } else {
          const scramjet = new ScramjetController(__scramjet$config);
          scramjet.init("/$/sw.js").then(async () => {
            await proxy.setTransports();
          });

          console.log("Scramjet Service Worker registered.");
        }
      },
    },
    ec: {
      type: "sw",
      file: "/~/sw.js",
      config: __eclipse$config,
      func: null,
    },
    auto: {
      type: "multi",
      file: null,
      config: null,
      func: async (input) => {
        return await proxy.automatic(input);
      },
    },
  };
  const windowing = new Windowing();
  const globalFunctions = new Global();
  const render = new Render(document.getElementById("browser-container"));
  const items = new Items();
  const utils = new Utils();
  //const history = new History(utils, proxy, swConfig, proxySetting);
  const tabs = new Tabs(render);

  tabs.createTab("daydream://newtab");

  const functions = new Functions(tabs);
  const keys = new Keys(tabs, functions);

  keys.init();

  if (
    typeof swConfig[proxySetting].func === "function" &&
    proxySetting === "sj"
  ) {
    await swConfig[proxySetting].func();
  }

  proxy.registerSW(swConfig[proxySetting]).then(async () => {
    await proxy.setTransports().then(async () => {
      const transport = await proxy.connection.getTransport();
      if (transport == null) {
        proxy.setTransports();
      }
    });
  });
  const uvSearchBar = items.addressBar;

  uvSearchBar.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      console.log("Searching...");

      const searchValue = uvSearchBar.value.trim();

      if (searchValue.startsWith("daydream://")) {
        utils.navigate(searchValue);
      } else {
        if (proxySetting === "auto") {
          const result = await swConfig.auto.func(proxy.search(searchValue));
          swConfigSettings = result;
          window.SWSettings = swConfigSettings;
        } else {
          swConfigSettings = swConfig[proxySetting];
          window.SWSettings = swConfigSettings;
        }

        if (
          typeof swConfigSettings.func === "function" &&
          proxySetting === "sj"
        ) {
          await swConfigSettings.func();
        }

        await proxy.registerSW(swConfigSettings).then(async () => {
          await proxy.setTransports();
        });

        console.log("swConfigSettings:", swConfigSettings);
        console.log(
          "swConfigSettings.func exists:",
          typeof swConfigSettings.func === "function",
        );
        if (typeof swConfigSettings.func === "function") {
          swConfigSettings.func();
        } else {
          console.warn("No function to execute in swConfigSettings.func");
        }

        console.log(
          `Using proxy: ${proxySetting}, Settings are: ` +
            (await swConfigSettings),
        );
        console.log(swConfigSettings);

        switch (swConfigSettings.type) {
          case "sw":
            let encodedUrl =
              swConfigSettings.config.prefix +
              __uv$config.encodeUrl(proxy.search(searchValue));
            const activeIframe = document.querySelector("iframe.active");
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
  });

  functions.init();

  const searchbar = new Search(proxy, swConfig, proxySetting, eventsAPI);
  searchbar.init(items.addressBar);

  uvSearchBar.addEventListener("keydown", (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      setTimeout(() => {
        searchbar.clearSuggestions();
        document.querySelector(
          "#suggestion-list.suggestion-list",
        ).style.display = "none";
      }, 30);
    }
  });

  window.nightmare = nightmare;
  window.nightmarePlugins = nightmarePlugins;
  window.settings = settingsAPI;
  window.eventsAPI = eventsAPI;
  window.extensions = extensionsAPI;
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
  window.keys = keys;
  window.searchbar = searchbar;
  window.SWconfig = swConfig;
  window.ProxySettings = proxySetting;
});
