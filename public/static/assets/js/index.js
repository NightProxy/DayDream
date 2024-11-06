(async () => {
  const nightmare = new Nightmare();
  const nightmarePlugins = new NightmarePlugins(nightmare);

  const settingsAPI = new SettingsAPI();
  const profilesAPI = new ProfilesAPI();
  const loggingAPI = new Logger();

  var defWisp =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  var wispUrl = await settingsAPI.getItem("wisp") || defWisp;
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
      file: "/@/sw.js",
      config: __uv$config,
      func: null
    },
    sj: {
      file: "/$/sw.js",
      config: $scramjet.config,
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
      file: "/~/sw.js",
      config: __eclipse$config,
      func: null,
    },
    auto: {
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
  const tabs = new Tabs(render, nightmare, utils, items, loggingAPI, settingsAPI);

  tabs.createTab("daydream://newtab");


  const windowing = new Windowing(loggingAPI, settingsAPI);
  const functions = new Functions(items, nightmare, tabs, loggingAPI, settingsAPI, utils, nightmarePlugins, windowing);
  const keys = new Keys(tabs, functions, settingsAPI);

  keys.init();

  if (typeof swFunction === "function") {
    swFunction();
  }

  proxy.registerSW(swConfig[proxySetting].file, swConfig[proxySetting].config).then(async () => {
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
          swConfigSettings = result.config;
        } else {
          swConfigSettings = swConfig[proxySetting].config;
        }

        var { file: swFile, config: swConfigSettings } = proxySetting === "auto"
          ? await swConfig.auto.func(proxy.search(searchValue))
          : swConfig[proxySetting];

        await proxy.registerSW(swFile, swConfigSettings);

        let encodedUrl = swConfigSettings.prefix + proxy.crypts.encode(proxy.search(searchValue));

        console.log(`Using proxy: ${proxySetting}`);

        const activeIframe = document.querySelector("iframe.active");
        if (activeIframe) {
          activeIframe.src = encodedUrl;
          setTimeout(() => {
            activeIframe.src = activeIframe.src;
          }, 100);
        }
      }
    }
  });


  functions.init()

  const searchbar = new Search(utils, nightmare, loggingAPI, settingsAPI, proxy, swConfig, proxySetting);
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
})();
