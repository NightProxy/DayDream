var defWisp =
  (location.protocol === "https:" ? "wss" : "ws") +
  "://" +
  location.host +
  "/wisp/";
var wispUrl = localStorage.getItem("wisp") || defWisp;
var bareUrl = localStorage.getItem("bare") || "/bare/";

const api = new Api(
  localStorage.getItem("search") || "https://www.google.com/search?q=%s",
  localStorage.getItem("transports") || "epoxy",
  wispUrl,
  bareUrl,
  document.getElementById("browser-container"),
);

const proxySetting = localStorage.getItem("proxy") ?? "uv";
const swConfig = {
  uv: { file: "/@/sw.js", config: __uv$config }
};

const { file: swFile, config: swConfigSettings } = swConfig[proxySetting] ?? {
  file: "/@/sw.js",
  config: __uv$config,
};

function loadInitialTab() {
  api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
    await api.proxy.setTransports();
    const encodedUrl = sessionStorage.getItem("encodedUrl");
    if (encodedUrl) {
      api.browser.createTab(encodedUrl, false);
    } else {
      api.browser.createTab("tabs://newtab");
    }
  });
}

const uvSearchBar = api.browser.addressBar;

uvSearchBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    console.log("Searching...")
    e.preventDefault();
    if (uvSearchBar.value.startsWith("tabs://")) {
      api.browser.navigate(uvSearchBar.value);
    } else {
      api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
        await api.proxy.setTransports();
        let encodedUrl =
          swConfigSettings.prefix +
          api.proxy.crypts.encode(api.proxy.search(uvSearchBar.value));
        const activeIframe = document.querySelector("iframe.active");
        if (activeIframe) {
          activeIframe.src = encodedUrl;
          setTimeout(() => {
            activeIframe.src = activeIframe.src;
          }, 100);
        }
      });
    }
  }
});

loadInitialTab();
