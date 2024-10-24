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
);

const proxySetting = localStorage.getItem("proxy") ?? "uv";
const swConfig = {
  uv: { file: "/@/sw.js", config: __uv$config },
};

const { file: swFile, config: swConfigSettings } = swConfig[proxySetting] ?? {
  file: "/@/sw.js",
  config: __uv$config,
};

const utils = new Utils();

switch (localStorage.getItem("search")) {
  case "https://duckduckgo.com/?q=%s":
    document.querySelector(".searchEngineIcon").src = "/assets/imgs/b/ddg.webp";
    document.querySelector(".searchEngineIcon").style.transform = "scale(1.35)";
    break;
  case "https://bing.com/search?q=%s":
    document.querySelector(".searchEngineIcon").src =
      "/assets/imgs/b/bing.webp";
    document.querySelector(".searchEngineIcon").style.transform = "scale(1.65)";
    break;
  case "https://www.google.com/search?q=%s":
    document.querySelector(".searchEngineIcon").src =
      "/assets/imgs/b/google.webp";
    document.querySelector(".searchEngineIcon").style.transform = "scale(1.2)";
    break;
  case "https://search.yahoo.com/search?p=%s":
    document.querySelector(".searchEngineIcon").src =
      "/assets/imgs/b/yahoo.webp";
    document.querySelector(".searchEngineIcon").style.transform = "scale(1.5)";
    break;
  default:
    utils.getFavicon(localStorage.getItem("search")).then((dataUrl) => {
      if (dataUrl == null || dataUrl.endsWith("null")) {
        document.querySelector(".searchEngineIcon").src =
          "/assets/imgs/b/google.webp";
        document.querySelector(".searchEngineIcon").style.transform =
          "scale(1.2)";
      } else {
        document.querySelector(".searchEngineIcon").src = dataUrl;
        document.querySelector(".searchEngineIcon").style.transform =
          "scale(1.2)";
      }
    });
}

api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
  await api.proxy.setTransports();
  if (utils.getInternalURL(location.pathname) == "daydream://newtab") {
    let newtabSearchBar = document.getElementById("newTabSearch");

    if (newtabSearchBar) {
      newtabSearchBar.addEventListener("keydown", function (e) {
        if ((e.key = "Enter")) {
          let newTabSearchVar = utils.processUrl(newtabSearchBar.value);
          if (!newTabSearchVar.startsWith("/internal/")) {
            newTabSearchVar = api.proxy.search(this.newTabSearchVar);
            let encodedUrl =
              swConfigSettings.prefix +
              api.proxy.crypts.encode(newTabSearchVar);
            location.href = encodedUrl;
          }
        }
      });
    }
  }
});
