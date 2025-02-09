document.addEventListener("DOMContentLoaded", async () => {
  const nightmare = new Nightmare();

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
  sandstone.libcurl.set_websocket(wispUrl);
  var searchVAR =
    (await settingsAPI.getItem("search")) ||
    "https://www.duckduckgo.com/?q=%s";
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

          console.log("Scramjet Service Worker registered.");
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
    ss: {
      type: "iframe",
      file: null,
      config: null,
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
  const globalFunctions = new Global(settingsAPI);
  async function getFavicon(url) {
    try {
      var googleFaviconUrl = `/internal/icons/${encodeURIComponent(url)}`;
      return googleFaviconUrl;
    } catch (error) {
      console.error("Error fetching favicon as data URL:", error);
      return null;
    }
  }

  if (typeof swConfig[proxySetting].func === "function" && proxySetting === "sj") {
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
  const uvSearchBar = document.querySelector("#newTabSearch");

  document.querySelector(".searchEngineIcon").style.display = "block";
  switch (await settingsAPI.getItem("search")) {
    case "https://duckduckgo.com/?q=%s":
      document.querySelector(".searchEngineIcon").src =
        "/assets/imgs/b/ddg.webp";
      document.querySelector(".searchEngineIcon").style.transform =
        "scale(1.35)";
      break;
    case "https://bing.com/search?q=%s":
      document.querySelector(".searchEngineIcon").src =
        "/assets/imgs/b/bing.webp";
      document.querySelector(".searchEngineIcon").style.transform =
        "scale(1.65)";
      break;
    case "https://www.google.com/search?q=%s":
      document.querySelector(".searchEngineIcon").src =
        "/assets/imgs/b/google.webp";
      document.querySelector(".searchEngineIcon").style.transform =
        "scale(1.2)";
      break;
    case "https://search.yahoo.com/search?p=%s":
      document.querySelector(".searchEngineIcon").src =
        "/assets/imgs/b/yahoo.webp";
      document.querySelector(".searchEngineIcon").style.transform =
        "scale(1.5)";
      break;
    default:
      getFavicon(await settingsAPI.getItem("search")).then((dataUrl) => {
        if (dataUrl == null || dataUrl.endsWith("null")) {
          document.querySelector(".searchEngineIcon").src =
            "/assets/imgs/b/ddg.webp";
          document.querySelector(".searchEngineIcon").style.transform =
            "scale(1.35)";
        } else {
          document.querySelector(".searchEngineIcon").src = dataUrl;
          document.querySelector(".searchEngineIcon").style.transform =
            "scale(1.2)";
        }
      });
  }

  uvSearchBar.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      console.log("Searching...");

      const searchValue = uvSearchBar.value.trim();

      if (searchValue.startsWith("daydream://")) {
        searchValue = searchValue.replace("daydream://", "/internal/");
        location.href = searchValue;
      } else {
        if (proxySetting === "auto") {
          const result = await swConfig.auto.func(proxy.search(searchValue));
          swConfigSettings = result;
        } else {
          swConfigSettings = swConfig[proxySetting];
        }

        await proxy.registerSW(swConfigSettings);

        console.log("swConfigSettings:", swConfigSettings);
        console.log(
          "swConfigSettings.func exists:",
          typeof swConfigSettings.func === "function"
        );
        if (typeof swConfigSettings.func === "function") {
          swConfigSettings.func();
        } else {
          console.warn("No function to execute in swConfigSettings.func");
        }

        console.log(
          `Using proxy: ${proxySetting}, Settings are: ` +
          (await swConfigSettings)
        );
        console.log(swConfigSettings);

        switch (swConfigSettings.type) {
          case "sw":
            let encodedUrl =
              swConfigSettings.config.prefix +
              __uv$config.encodeUrl(proxy.search(searchValue));
            location.href = encodedUrl;
            break;
          case "iframe":
            if (proxySetting == "auto" || proxySetting == "ss") {
              let main_frame = new sandstone.controller.ProxyFrame(
                document.querySelector("iframe.active")
              );
              main_frame.navigate_to(proxy.search(searchValue));

              main_frame.on_load = async () => {
                uvSearchBar.value = main_frame.url.href;
              };
            }
        }
      }
    }
  });

  const nightmarePlugins = new NightmarePlugins(nightmare);

  let rightclickmenucontent = nightmare.createElement("div", {}, [
    nightmare.createElement(
      "div",
      {
        class: "menu-item",
        id: "settingsButton",
        onclick: () => {
          window.parent.tabs.createTab("daydream://settings");
        },
      },
      [
        nightmare.createElement(
          "span",
          { class: "material-symbols-outlined" },
          ["settings"]
        ),
        nightmare.createElement("span", { class: "menu-label" }, [
          "Settings",
        ]),
      ]
    ),
    nightmare.createElement(
      "div",
      {
        class: "menu-item",
        id: "about-blankButton",
        onclick: () => {
          window.parent.windowing.aboutBlankWindow();
        },
      },
      [
        nightmare.createElement(
          "span",
          { class: "material-symbols-outlined" },
          ["visibility_off"]
        ),
        nightmare.createElement("span", { class: "menu-label" }, [
          "About:Blank",
        ]),
      ]
    ),
  ]);

  nightmarePlugins.rightclickmenu.attachTo(document.querySelector("body"), rightclickmenucontent)
});
