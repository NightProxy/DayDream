(async () => {
  const nightmare = new Nightmare();

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();
  const loggingAPI = new Logger();

  const global = new Global(settingsAPI);

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

  // Simplified Rendering System based on the one I wrote for Light. (Im Lazy)
  let appsData = [];

  function getAppElement(app) {
    const appElement = nightmare.createElement(
      "div",
      {
        class: "app",
        onclick: () => {
          launch(app.link);
        },
      },
      [
        nightmare.createElement("div", { class: "img-container" }, [
          nightmare.createElement("img", { src: app.image }),
          nightmare.createElement("p", {}, [app.name]),
        ]),
      ],
    );

    return appElement;
  }

  function renderApps(filteredApps = []) {
    const appsGrid = document.getElementById("gamesGrid");
    appsGrid.innerHTML = "";

    filteredApps.sort((a, b) => a.name.localeCompare(b.name));

    filteredApps.forEach((app) => {
      const appElement = getAppElement(app);
      appsGrid.appendChild(appElement);
    });
  }

  async function fetchAppData() {
    try {
      const response = await fetch("/assets/json/g.json");
      appsData = await response.json();
      return appsData;
    } catch (error) {
      console.error("Error fetching JSON data:", error);
      return [];
    }
  }

  async function initializePage() {
    await fetchAppData();
    renderApps(appsData);
  }

  initializePage();

  async function launch(link) {
    if (proxySetting === "auto") {
      const result = await swConfig.auto.func(proxy.search(link));
      swConfigSettings = result;
    } else {
      swConfigSettings = swConfig[proxySetting];
    }

    await proxy.registerSW(swConfigSettings).then(async () => {
      await proxy.setTransports();
    });

    let encodedUrl =
      swConfigSettings.config.prefix +
      __uv$config.encodeUrl(proxy.search(link));
    location.href = encodedUrl;
  }
})();
