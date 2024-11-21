(function () {
  const ogWindowOpen = window.open;
  window.open = function (url, isDDXURL) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      launch = async (link) => {
        if (window.parent.ps === "auto") {
          const result = await window.parent.SWConfig.auto.func(
            window.parent.px.search(link)
          );
          swConfigSettings = result;
        } else {
          swConfigSettings = window.parent.SWConfig[window.parent.ProxySetting];
        }

        await window.parent.proxy.registerSW(swConfigSettings).then(async () => {
          await window.parent.proxy.setTransports();
        });

        encodeUrl = function (url) {
          if (!url) return url;
          let result = "";
          for (let i = 0; i < url.length; i++) {
            result +=
              i % 2 ? String.fromCharCode(url.charCodeAt(i) ^ 2) : url[i];
          }
          return encodeURIComponent(result);
        };

        let encodedUrl =
          location.origin +
          swConfigSettings.config.prefix +
          encodeUrl(window.parent.proxy.search(link));
        return encodedUrl;
      };
      return window.parent.tabs.createTab(launch(url));
    } else if (isDDXURL === true) {
      return window.parent.tabs.createTab(url);
    }
    return null;
  };
})();
