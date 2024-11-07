document.addEventListener("DOMContentLoaded", async () => {
  const nightmare = new Nightmare();
  const nightmarePlugins = new NightmarePlugins(nightmare);

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();
  const profilesAPI = new ProfilesAPI();
  const loggingAPI = new Logger();

  var defWisp =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  var wispUrl = await settingsAPI.getItem("wisp") || defWisp;
  sandstone.libcurl.set_websocket(wispUrl);
  var searchVAR = await settingsAPI.getItem("search") || "https://www.google.com/search?q=%s";
  var transVAR = await settingsAPI.getItem("transports") || "libcurl";
  const proxy = new Proxy(
    searchVAR,
    transVAR,
    wispUrl,
    loggingAPI
  );

  const proxySetting = await settingsAPI.getItem("proxy") ?? "uv";
  let swConfigSettings = {};
  const swConfig = {
    uv: {
      type: 'sw',
      file: "/@/sw.js",
      config: __uv$config,
      func: null
    },
    sj: {
      type: 'sw',
      file: "/$/sw.js",
      config: __scramjet$config,
      func: async () => {
        const scramjet = new ScramjetController(__scramjet$config);
        scramjet.modifyConfig(__scramjet$config);

        scramjet.init('/$/sw.js').then(async () => {
          await proxy.setTransports();
        });
        console.log("Scramjet Service Worker registered.");
      }
    },
    ec: {
      type: 'sw',
      file: "/~/sw.js",
      config: __eclipse$config,
      func: null,
    },
    ss: {
      type: 'iframe',
      file: null,
      config: null,
      func: null,
    },
    auto: {
      type: 'multi',
      file: null,
      config: null,
      func: async (input) => {
        return await proxy.automatic(input);
      }
    }
  };
  const globalFunctions = new Global(settingsAPI)
  const render = new Render(document.getElementById("browser-container"), nightmare, loggingAPI, settingsAPI);
  const items = new Items();
  const utils = new Utils(items, loggingAPI, settingsAPI);
  const tabs = new Tabs(render, nightmare, utils, items, loggingAPI, settingsAPI, eventsAPI);

  tabs.createTab("daydream://newtab");


  const windowing = new Windowing(loggingAPI, settingsAPI);
  const functions = new Functions(items, nightmare, tabs, loggingAPI, settingsAPI, utils, nightmarePlugins, windowing, eventsAPI);
  const keys = new Keys(tabs, functions, settingsAPI, eventsAPI);

  keys.init();

  if (typeof swFunction === "function") {
    swFunction();
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
        } else {
          swConfigSettings = swConfig[proxySetting];
        }

        await proxy.registerSW(swConfigSettings);


        console.log(`Using proxy: ${proxySetting}, Settings are: ` + swConfigSettings);
        console.log(swConfigSettings)


        switch (swConfigSettings.type) {
          case "sw":
            let encodedUrl = swConfigSettings.config.prefix + __uv$config.encodeUrl(proxy.search(searchValue));
            const activeIframe = document.querySelector('iframe.active');
            if (activeIframe) {
              activeIframe.src = encodedUrl;
            }
            break;
          case "iframe":
            if (proxySetting == "auto" || proxySetting == "ss") {
              let main_frame = new sandstone.controller.ProxyFrame(document.querySelector("iframe.active"));
              main_frame.navigate_to(proxy.search(searchValue));

              main_frame.on_load = async () => {
                uvSearchBar.value = main_frame.url.href;
              }


            }
        }
      }
    }
  });


  functions.init()

  const searchbar = new Search(utils, nightmare, loggingAPI, settingsAPI, proxy, swConfig, proxySetting, eventsAPI);
  searchbar.init(items.addressBar);

  uvSearchBar.addEventListener("keydown", (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      setTimeout(() => {
        searchbar.clearSuggestions();
        document.querySelector("#suggestion-list.suggestion-list").style.display = "none";
      }, 30)
    }
  });
  return {tabs, functions, keys, searchbar, globalFunctions, render, items, utils, windowing, eventsAPI, loggingAPI, settingsAPI, nightmarePlugins, nightmare, profilesAPI, proxy, swConfig, swConfigSettings};
});
