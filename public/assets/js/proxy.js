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

    if (!searchVar || !transportVar || !wispUrl || !bareUrl) {
      console.error("One or more variables are null or undefined:", {
        searchVar,
        transportVar,
        wispUrl,
        bareUrl,
      });
    }
  }

  async setTransports() {
    const transports = this.transportVar;
    if (transports === "epoxy") {
      await this.connection.setTransport("/epoxy/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    } else if (transports === "libcurl") {
      await this.connection.setTransport("/libcurl/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    } else if (transports === "baremod") {
      await this.connection.setTransport("/baremod/index.mjs", [this.bareUrl]);
    } else {
      await this.connection.setTransport("/epoxy/index.mjs", [
        { wisp: this.wispUrl },
      ]);
    }
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

  launch() {
    console.log("Proxy launched.");
  }

  async registerSW(swFile, swConfigSettings) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(async () => {
        await setTransports();
      });
      this.updateSW();
      navigator.serviceWorker.register(swFile, {
        scope: swConfigSettings.prefix,
      });
    }
  }

  updateSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        registration.update();
        console.log(`Service Worker at ${registration.scope} Updated`);
      }
    });
  }

  uninstallSW() {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        registration.unregister();
        console.log(`Service Worker at ${registration.scope} Unregistered`);
      }
    });
  }

  async fetchConfig(url, jsonData) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      jsonData = JSON.parse(text);
      return jsonData;
    } catch (error) {
      console.error("Error fetching the text file:", error);
      return null;
    }
  }
}
