var defWisp =
  (location.protocol === "https:" ? "wss" : "ws") +
  "://" +
  location.host +
  "/wisp/";
var wispUrl = localStorage.getItem("wisp") || defWisp;

const nightmare = new Nightmare();

const dataApi = new DataAPI();

const proxy = new Proxy(
  localStorage.getItem("search") || "https://www.google.com/search?q=%s",
  localStorage.getItem("transports") || "libcurl",
  wispUrl,
  dataApi
);

const proxySetting = localStorage.getItem("proxy") ?? "uv";
let swConfigSettings = {};
const swConfig = {
  uv: {
    file: "/@/sw.js",
    config: __uv$config,
    func: null
  },
  sj: {
    file: "/$/sw.js",
    config: __scramjet$config,
    func: async () => {
      const scramjet = new ScramjetController(__scramjet$config);
      scramjet.modifyConfig(__scramjet$config);

      scramjet.init('/$/sw.js').then(async () => {
        await setTransports();
      });
      console.log("Scramjet Service Worker registered.");
    }
  },
  auto: {
    file: null,
    config: null,
    func: async (input) => {
      return await proxy.automatic(input);
    }
  }
};
const render = new Render(document.getElementById("browser-container"), nightmare, dataApi);
const items = new Items();
const utils = new Utils(items,dataApi);
const tabs = new Tabs(render, nightmare, utils, items, dataApi);

tabs.createTab("daydream://newtab");

const functions = new Functions(items, nightmare,tabs, dataApi);
const keys = new Keys(tabs, functions, dataApi);
 
keys.init();

if (typeof swFunction === "function") {
  swFunction();
}

proxy.registerSW(swConfig[proxySetting].file, swConfig[proxySetting].config).then(async () => {
  await proxy.setTransports();
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
      console.log(`Encoded URL: ${encodedUrl}`);

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

const searchbar = new Search(utils, nightmare, dataApi, proxy, swConfig, proxySetting);
searchbar.init(items.addressBar);