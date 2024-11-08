class Proxy {
  constructor(searchVar, transportVar, wispUrl, logging) {
    if (!searchVar || !transportVar || !wispUrl) {
      console.error("Proxy, search, and transport variables are required.");
      return;
    }

    this.crypts = new crypts();
    this.connection = new BareMux.BareMuxConnection("/baremux/worker.js");

    console.log("Proxy variables:", {
      searchVar,
      transportVar,
      wispUrl,
    });

    this.searchVar = searchVar;
    this.transportVar = transportVar;
    this.wispUrl = wispUrl;
    this.logging = logging;
  }

  async setTransports() {
    const transports = this.transportVar;
    const transportMap = {
      epoxy: "/epoxy/index.mjs",
      libcurl: "/libcurl/index.mjs",
    };
    const transportFile = transportMap[transports] || "/libcurl/index.mjs";
    await this.connection.setTransport(transportFile, [{ wisp: this.wispUrl }]);
    this.logging.createLog(`Transport Set: ${this.connection.getTransport}`);
  }

  search(input) {
    input = input.trim();
    const searchTemplate =
      this.searchVar || "https://www.google.com/search?q=%s";
    try {
      return new URL(input).toString();
    } catch (err) {
      try {
        const url = new URL(`http://${input}`);
        if (url.hostname.includes(".")) {
          return url.toString();
        }
        throw new Error("Invalid hostname");
      } catch (err) {
        return searchTemplate.replace("%s", encodeURIComponent(input));
      }
    }
  }

  async registerSW(swConfig) {
    switch (swConfig.type) {
      case "sw":
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register(swConfig.file, {});

          navigator.serviceWorker.ready.then(async () => {
            await this.setTransports().then(async () => {
              const transport = await this.connection.getTransport();
              if (transport == null) {
                this.setTransports();
              }
            });
            this.updateSW();
          });
        }
        break;
      case "iframe":
        console.log("iframe proxy selected");
        break;
      case "multi":
        console.log("multi proxy selected");
        break;
    }
  }

  updateSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach((registration) => {
        registration.update();
        this.logging.createLog(
          `Service Worker at ${registration.scope} Updated`,
        );
      });
    });
  }

  uninstallSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach((registration) => {
        registration.unregister();
        this.logging.createLog(
          `Service Worker at ${registration.scope} Unregistered`,
        );
      });
    });
  }

  async fetchProxyMapping() {
    try {
      const response = await fetch("/assets/json/proxy.json");
      if (!response.ok) throw new Error("Failed to load proxy mappings.");
      return await response.json();
    } catch (error) {
      console.error("Error fetching proxy mappings:", error);
      return null;
    }
  }

  getDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      console.error("Invalid URL format:", error);
      return null;
    }
  }

  async determineProxy(domain) {
    const proxyMapping = await this.fetchProxyMapping();
    if (proxyMapping) {
      return proxyMapping[domain] || proxyMapping["default"];
    }
    return "uv";
  }

  async automatic(input) {
    const domain = this.getDomainFromUrl(input);
    const selectedProxy = await this.determineProxy(domain);

    var {
      type: swType,
      file: swFile,
      config: swConfigSettings,
      func: swFunction,
    } = swConfig[selectedProxy] ?? {
      type: "sw",
      file: "/@/sw.js",
      config: __uv$config,
      func: null,
    };

    if (swFunction) swFunction();

    await this.registerSW({
      type: swType,
      file: swFile,
      config: swConfigSettings,
    });
    await this.setTransports();

    return { type: swType, file: swFile, config: swConfigSettings };
  }

  async redirect(swConfig, proxySetting, url) {
    this.registerSW(swConfig[proxySetting].file).then(async () => {
      await this.setTransports();
    });
    if (proxySetting === "auto") {
      const result = await swConfig.auto.func(proxy.search(url));
      swConfigSettings = result;
    } else {
      swConfigSettings = swConfig[proxySetting];
    }
    const activeIframe = document.querySelector("iframe.active");
    switch (swConfigSettings.type) {
      case "sw":
        let encodedUrl =
          swConfigSettings.config.prefix +
          __uv$config.encodeUrl(this.search(url));
        if (activeIframe) {
          activeIframe.src = encodedUrl;
        }
        break;
      case "iframe":
        if (proxySetting == "auto" || proxySetting == "ss") {
          let main_frame = new sandstone.controller.ProxyFrame(activeIframe);
          main_frame.navigate_to(this.search(url));

          main_frame.on_load = async () => {
            document.getElementById("uv-address").value = main_frame.url.href;
          };
        }
        break;
    }
  }
}
