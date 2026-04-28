import "@css/vars.css";
import "@css/imports.css";
import "@css/global.css";
import "basecoat-css/all";

// Inline CSS for Shadow DOM injection
import varsCSS from "@css/vars.css?inline";
import importsCSS from "@css/imports.css?inline";
import globalCSS from "@css/global.css?inline";

import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { SettingsAPI } from "@apis/settings";
import { cache } from "@apis/cache";
import { EventSystem } from "@apis/events";
import { ProfilesAPI } from "@apis/profiles";
import { Logger } from "@apis/logging";
import { Proxy } from "@apis/proxy";
import { Windowing } from "@browser/windowing";
import { DDXGlobal } from "@utils/global/index";
import { patchDocument } from "./utils/document";
//import { Render } from "@browser/render";
import { Render } from "@components/Render";
import { Items } from "@browser/items";
import { Protocols } from "@browser/protocols";
import { Tabs } from "@browser/tabs-updated";
import { Functions } from "@browser/functions";
import { Search } from "@browser/search";
import { universalTheme } from "@utils/global/universalTheme";
import { checkNightPlusStatus } from "@apis/nightplus";
import { initClipboardDeobfuscator } from "@utils/clipboardDeobfuscator";
import { basePath, resolvePath } from "@utils/basepath";
//@ts-ignore
import { RefluxAPI } from "@nightnetwork/reflux/api";
// @ts-ignore
const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController(window.__scramjet$config);
const scramjetReady = scramjet.init();

if ("serviceWorker" in navigator) {
  scramjetReady
    .then(() =>
      navigator.serviceWorker.register(resolvePath("sw.js"), {
        scope: basePath,
      }),
    )
    .then(() => console.log("[Main] Root-scope SW registered at", basePath))
    .catch((err: any) =>
      console.warn("[Main] Root-scope SW registration failed:", err),
    );
}

navigator.serviceWorker?.addEventListener("message", (e) => {
  console.log("[Main] SW message received:", e.data);
  if (e.data?.type === "reload") location.reload();
});
navigator.serviceWorker?.startMessages();

document.addEventListener("DOMContentLoaded", async () => {
  let systemInitialized = false;

  await universalTheme.init();

  setTimeout(() => {
    initClipboardDeobfuscator({ debug: false });
  }, 500);

  const settingsAPI = new SettingsAPI();
  const eventsAPI = new EventSystem();
  const refluxAPI = new RefluxAPI();
  await cache.init();

  const profilesAPI = new ProfilesAPI(checkNightPlusStatus, 3);
  await profilesAPI.initPromise;

  const loggingAPI = new Logger();

  const proxy = new Proxy();

  const proxySetting = (await settingsAPI.getItem("proxy")) ?? "sj";
  let swConfigSettings: Record<string, any> = {};
  const swConfig = {
    uv: {
      type: "sw",
      file: resolvePath("sw.js"),
      config: window.__uv$config,
      func: null,
    },
    sj: {
      type: "sw",
      file: resolvePath("sw.js"),
      config: window.__scramjet$config,
      func: async () => {
        await scramjetReady;
        await proxy.setTransports();
        console.log("Scramjet Service Worker registered.");
      },
    },
    auto: {
      type: "multi",
      file: null,
      config: null,
      func: null,
    },
  };

  const container: HTMLDivElement | null = document.getElementById(
    "browser-container",
  ) as HTMLDivElement;

  let shadowRoot: ShadowRoot;
  if (container) {
    shadowRoot = container.attachShadow({ mode: "open" });
  } else {
    console.error("Browser container not found");
    return;
  }

  shadowRoot.append(
    Object.assign(document.createElement("style"), {
      textContent: varsCSS + importsCSS + globalCSS,
    }),
    Object.assign(document.createElement("div"), {
      id: "root",
      style: "width: 100%; height: 100%; position: fixed; inset: 0;",
    }),
  );

  const shadowDocument = document.implementation.createHTMLDocument("");

  patchDocument(shadowRoot, shadowDocument);

  window.d = shadowRoot; //DONT FUCKING CHNAGE THIS TO "doc" OR ANYTHING ELSE, IT'S USED IN THE DOCUMENT PATCHING AND IF YOU CHANGE IT, THE PATCHING WILL BREAK AND THE WHOLE BROWSER WILL BREAK

  const initializeSystem = async () => {
    if (systemInitialized) {
      return;
    }

    systemInitialized = true;

    setTimeout(() => {
      const theming = universalTheme.getTheming();
      theming.applyTheme(theming.currentTheme);
    }, 100);

    const proto = new Protocols(swConfig, proxySetting, proxy);
    const windowing = new Windowing();
    const globalFunctions = new DDXGlobal();
    const items = new Items();
    const tabs = new Tabs(proto, swConfig, proxySetting, items, proxy);

    window.tabs = tabs;
    window.protocols = proto;
    window.windowing = windowing;
    window.items = items;
    window.eventsAPI = eventsAPI;
    window.settings = settingsAPI;
    window.cache = cache;
    window.proxy = proxy;
    //@ts-ignore
    window.reflux = refluxAPI;
    window.logging = loggingAPI;

  const startupBehavior =
    (await settingsAPI.getItem("startupBehavior")) || "newtab";
  const startupCustomUrl =
    (await settingsAPI.getItem("startupCustomUrl")) || "";

  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.ready;
  }

  let restored = false;
  if (startupBehavior === "restore") {
    restored = await window.tabs.restoreSession();
  }

  if (!restored) {
    if (startupBehavior === "custom" && startupCustomUrl) {
      window.tabs.createTab(startupCustomUrl);
    } else {
      window.tabs.createTab("ddx://newtab/");
    }
  }

  window.addEventListener("beforeunload", () => {
    window.tabs.saveSession();
  });

  const functions = new Functions(tabs, proto);
  await functions.initPromise;
  await functions.init();

  if (
    proxySetting === "sj" &&
    swConfig[proxySetting as keyof typeof swConfig] &&
    typeof swConfig[proxySetting as keyof typeof swConfig].func === "function"
  ) {
    await (swConfig[proxySetting as keyof typeof swConfig].func as Function)();
  }

  await proxy.registerSW(swConfig[proxySetting as keyof typeof swConfig]);
  await proxy.setTransports();
  const transport = await proxy.connection.getTransport();
  if (transport == null) {
    await proxy.setTransports();
  }
  const uvSearchBar = items.addressBar;

  uvSearchBar!.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const searchValue = uvSearchBar!.value.trim();

      if (proto.isRegisteredProtocol(searchValue)) {
        const url =
          (await proto.processUrl(searchValue)) ||
          resolvePath("internal/error/");
        const iframe = items.frameContainer!.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;

        if (iframe) {
          iframe.setAttribute("src", url);
        } else {
          console.warn("No active iframe found for navigation");
        }
      } else {
        if (proxySetting === "auto") {
          const result = (await proxy.automatic(
            proxy.search(searchValue),
            swConfig,
          )) as Record<string, any>;
          swConfigSettings = result;
          window.SWSettings = swConfigSettings;
        } else {
          swConfigSettings = swConfig[proxySetting as keyof typeof swConfig];
          window.SWSettings = swConfigSettings;
        }

        if (
          proxySetting === "sj" &&
          swConfigSettings &&
          typeof swConfigSettings.func === "function"
        ) {
          (await swConfigSettings.func()) as Function;
        }

        await proxy.registerSW(swConfigSettings).then(async () => {
          await proxy.setTransports();
        });

        if (swConfigSettings && typeof swConfigSettings.func === "function") {
          swConfigSettings.func();
        }

        if (swConfigSettings && swConfigSettings.type) {
          switch (swConfigSettings.type) {
            case "sw":
              let encodedUrl =
                swConfigSettings.config.prefix +
                window.__uv$config.encodeUrl(proxy.search(searchValue));
              const activeIframe = document.querySelector(
                "iframe.active",
              ) as HTMLIFrameElement;
              if (activeIframe) {
                activeIframe.src = encodedUrl;
              }
              if (!activeIframe) {
                tabs.createTab(location.origin + encodedUrl);
              }
              break;
          }
        }
      }
    }
  });

  const searchSuggestionsEnabled =
    (await settingsAPI.getItem("searchSuggestions")) !== "false";
  if (searchSuggestionsEnabled) {
    const searchbar = new Search(proxy, swConfig, proxySetting, proto);
    if (items.addressBar) {
      await searchbar.init(items.addressBar);
    }
    window.searchbar = searchbar;
  }

  window.logging = loggingAPI;
  window.profiles = profilesAPI;
  window.globals = globalFunctions;
  //window.renderer = render;
  window.functions = functions;
  window.SWconfig = swConfig;
  window.ProxySettings = proxySetting;

  };

  createRoot(shadowRoot.getElementById("root")!).render(
    <StrictMode>
      <Suspense fallback={<div>Loading...</div>}>
        <Render onReady={initializeSystem} />
      </Suspense>
    </StrictMode>,
  );
});
