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
      await scramjet.init("/$/sw.js");
      await proxy.setTransports();
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

const { file: swFile, config: swConfigSettings, func: swFunction } = swConfig[proxySetting] ?? {
  file: "/@/sw.js",
  config: __uv$config,
  func: null,
};

const render = new Render(document.getElementById("browser-container"));
const items = new Items();
const utils = new Utils(items);
const tabs = new Tabs(render, nightmare, utils, items);
const functions = new Functions(items, tabs);
const searchbar = new Search(utils, proxy, swConfigSettings.prefix);

if (typeof swFunction === "function") {
  swFunction();
}

const uvSearchBar = items.addressBar;
uvSearchBar.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    console.log("Searching...");

    const searchValue = uvSearchBar.value.trim();

    if (searchValue.startsWith("daydream://")) {
      utils.navigate(searchValue);
    } else {
      const { file: swFile, config: swConfigSettings } = proxySetting === "automatic"
        ? await swConfig.automatic.func(searchValue)
        : swConfig[proxySetting];

      let encodedUrl = swConfigSettings.prefix + proxy.crypts.encode(proxy.search(searchValue));
      const decryptedUrl = proxy.decryptUrl(encodedUrl, proxySetting);

      console.log(`Using proxy: ${proxySetting}`);
      console.log(`Encoded URL: ${encodedUrl}`);
      console.log(`Decrypted URL: ${decryptedUrl}`);

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

proxy.registerSW(swConfig["uv"].file, swConfig["uv"].config).then(async () => {
  await proxy.setTransports();
  tabs.createTab("daydream://newtab");
});

functions.init();

searchbar.init(items.addressBar);
