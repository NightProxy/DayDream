class Proxy {
  constructor(searchVar, transportVar, wispUrl, bareUrl) {
    if (!searchVar || !transportVar || !wispUrl || !bareUrl) {
      console.error("Proxy, search, and transport variables are required.");
      return;
    }

    this.crypts = new crypts();
    this.connection = new BareMux.BareMuxConnection("/baremux/worker.js");

    console.log("Proxy variables:", {
      searchVar,
      transportVar,
      wispUrl,
      bareUrl,
    });

    this.searchVar = searchVar;
    this.transportVar = transportVar;
    this.wispUrl = wispUrl;
    this.bareUrl = bareUrl;
  }

  async setTransports() {
    const transports = this.transportVar;
    const transportMap = {
      "epoxy": "/epoxy/index.mjs",
      "libcurl": "/libcurl/index.mjs",
      "baremod": "/baremod/index.mjs"
    };
    const transportFile = transportMap[transports] || "/epoxy/index.mjs";
    await this.connection.setTransport(transportFile, [
      { wisp: this.wispUrl },
    ]);
  }

  search(input) {
    input = input.trim();
    const searchTemplate = this.searchVar || "https://www.google.com/search?q=%s";
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

  async registerSW(swFile, swConfigSettings) {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register(swFile, {
        scope: swConfigSettings.prefix,
      });

      navigator.serviceWorker.ready.then(async () => {
        await this.setTransports();
        this.updateSW();
      });
    }
  }

  updateSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(registration => {
        registration.update();
        console.log(`Service Worker at ${registration.scope} Updated`);
      });
    });
  }

  uninstallSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(registration => {
        registration.unregister();
        console.log(`Service Worker at ${registration.scope} Unregistered`);
      });
    });
  }

  async fetchProxyMapping() {
    try {
      const response = await fetch('/assets/json/proxy.json');
      if (!response.ok) throw new Error('Failed to load proxy mappings.');
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
    return "uv"; // Default to Ultraviolet
  }

  async automatic(input) {
    const domain = this.getDomainFromUrl(input);
    const selectedProxy = await this.determineProxy(domain);

    var { file: swFile, config: swConfigSettings, func: swFunction } = swConfig[selectedProxy] ?? {
      file: "/@/sw.js",
      config: __uv$config,
      func: null,
    };

    if (swFunction) swFunction();

    await this.registerSW(swFile, swConfigSettings);
    await this.setTransports();

    return { file: swFile, config: swConfigSettings };
  }

  async redirect(swConfig, proxySetting, url) {
    this.registerSW(swConfig[proxySetting].file, swConfig[proxySetting].config).then(async () => {
      await this.setTransports();
    });
    if (proxySetting === "auto") {
      const result = await swConfig.auto.func(proxy.search(searchValue));
      swConfigSettings = result.config;
    } else {
      swConfigSettings = swConfig[proxySetting].config;
    }
    let encodedUrl = swConfigSettings.prefix + __uv$config.encodeUrl(this.search(url));
        const activeIframe = document.querySelector('iframe.active');
        if (activeIframe) {
            activeIframe.src = encodedUrl;
        }
}
}