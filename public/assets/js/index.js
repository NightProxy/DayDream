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
  localStorage.getItem("transports") || "epoxy",
  wispUrl,
  bareUrl
);

const proxySetting = localStorage.getItem("proxy") ?? "uv";
const swConfig = {
  uv: { file: "/@/sw.js", config: __uv$config },
};

const { file: swFile, config: swConfigSettings } = swConfig[proxySetting] ?? {
  file: "/@/sw.js",
  config: __uv$config,
};

const render = new Render(document.getElementById("browser-container"));
const utils = new Utils();
const items = new Items();
const tabs = new Tabs(render, nightmare, utils, items);
const functions = new Functions(items, tabs);
const searchbar = new Search(utils, proxy, swConfigSettings.prefix);

proxy.registerSW(swFile, swConfigSettings).then(async () => {
  await proxy.setTransports();
  tabs.createTab("daydream://newtab");
});

async function getFavicon(url) {
  try {
    var googleFaviconUrl = `/internal/icons/${encodeURIComponent(url)}`;
    return googleFaviconUrl;
  } catch (error) {
    console.error("Error fetching favicon as data URL:", error);
    return null;
  }
}
const uvSearchBar = items.addressBar;

uvSearchBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    console.log("Searching...");
    e.preventDefault();
    if (uvSearchBar.value.startsWith("daydream://")) {
      utils.navigate(uvSearchBar.value);
    } else {
      proxy.registerSW(swFile, swConfigSettings).then(async () => {
        await proxy.setTransports();
        let encodedUrl =
          swConfigSettings.prefix +
          proxy.crypts.encode(proxy.search(uvSearchBar.value));
        const activeIframe = document.querySelector("iframe.active");
        if (activeIframe) {
          activeIframe.src = encodedUrl;
          setTimeout(() => {
            activeIframe.src = activeIframe.src;
          }, 100);
        }
      });
    }
    uvSearchBar.querySelectorAll(".search-header__icon")[0].style.display =
      "none";

    let cleanedUrl = proxy.crypts.decode(
      url.split(swConfigSettings.prefix).pop()
    );

    let isSecure = cleanedUrl.startsWith("https://");

    cleanedUrl = cleanedUrl.replace(/^https?:\/\//, "");

    if (cleanedUrl === "a`owt8bnalk") {
      address2.value = "Loading...";
    } else if (cleanedUrl.endsWith("/500")) {
      address2.value = "Internal Server Error! Did you load a broken link?";
    } else {
      address2.value = cleanedUrl;
    }

    let webSecurityIcon = document.querySelector(".webSecurityIcon");
    if (isSecure) {
      webSecurityIcon.id = "secure";
      webSecurityIcon.innerHTML =
        '<span class="material-icons" style="font-size: 20px !important; height: 16px !important; width: 16px !important; padding: 0 !important; background-color: transparent !important;">lock</span>';
    } else {
      webSecurityIcon.id = "notSecure";
      webSecurityIcon.innerHTML =
        '<span class="material-icons" style="font-size: 20px !important; height: 16px !important; width: 16px !important; padding: 0 !important; background-color: transparent !important;">lock_open</span>';
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

functions.init();

searchbar.init(items.addressBar);
