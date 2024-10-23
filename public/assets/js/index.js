var defWisp =
  (location.protocol === "https:" ? "wss" : "ws") +
  "://" +
  location.host +
  "/wisp/";
var wispUrl = localStorage.getItem("wisp") || defWisp;
var bareUrl = localStorage.getItem("bare") || "/bare/";

const nightmare = new Nightmare();

const proxy = new Proxy(
  localStorage.getItem("search") || "https://www.google.com/search?q=%s",
  localStorage.getItem("transports") || "libcurl",
  wispUrl,
  bareUrl
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
  automatic: {
    file: null,
    config: null,
    func: async (input) => {
      return await proxy.automatic(input);
    }
  }
};
const render = new Render(document.getElementById("browser-container"));
const items = new Items();
const utils = new Utils(items);
const tabs = new Tabs(render, nightmare, utils, items);
const functions = new Functions(items, tabs);

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
      if (proxySetting === "automatic") {
        const result = await swConfig.automatic.func(proxy.search(searchValue));
        swConfigSettings = result.config;
      } else {
        swConfigSettings = swConfig[proxySetting].config;
      }

      var { file: swFile, config: swConfigSettings } = proxySetting === "automatic"
        ? await swConfig.automatic.func(proxy.search(searchValue))
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

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "t") {
    console.log("Creating new Tab");
    tabs.createTab("daydream://newtab");
  } else if (event.altKey && event.key === "w") {
    tabs.closeCurrentTab();
  }
});

functions.init()
tabs.createTab("daydream://newtab");

const searchbar = new Search(utils, proxy, swConfigSettings.prefix);
searchbar.init(items.addressBar);