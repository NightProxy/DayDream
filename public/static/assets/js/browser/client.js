(function () {
  const originalWindowOpen = window.open;

  // Utility to encode URLs
  const encodeUrl = (url) => {
    if (!url) return url;
    let result = "";
    for (let i = 0; i < url.length; i++) {
      result += i % 2 ? String.fromCharCode(url.charCodeAt(i) ^ 2) : url[i];
    }
    return encodeURIComponent(result);
  };

  // Override window.open
  window.open = async function (url, isDDXURL = false) {
    try {
      // Check if it's an HTTP(S) URL
      if (url.startsWith("http://") || url.startsWith("https://") && isDDXURL === false) {
        const launch = async (link) => {
          let swConfigSettings;

          // Determine service worker configuration
          if (window.parent.ProxySettings === "auto") {
            swConfigSettings = await window.parent.SWConfig.auto.func(
              window.parent.px.search(link)
            );
          } else {
            swConfigSettings =
              window.parent.SWConfig[window.parent.ProxySettings];
          }

          // Register the service worker and set up the proxy
          await window.parent.proxy
            .registerSW(swConfigSettings)
            .then(async () => {
              await window.parent.proxy.setTransports();
            });

          // Generate the encoded URL for the proxy
          const encodedUrl =
            location.origin +
            swConfigSettings.config.prefix +
            encodeUrl(window.parent.proxy.search(link));
          return encodedUrl;
        };

        // Create a new tab with the proxy URL
        const proxyUrl = await launch(url);
        return window.parent.tabs.createTab(proxyUrl);
      } else if (isDDXURL === true) {
        // Handle DDX URLs directly
        return window.parent.tabs.createTab(url);
      }

      // Default behavior for non-HTTP(S) and non-DDX URLs
      return null;
    } catch (error) {
      console.error("Error in custom window.open:", error);
      return null;
    }
  };
})();
