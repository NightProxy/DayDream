class Functions {
  constructor(items, tabs) {
    this.items = items;
    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
  }
  init() {
    this.items.backButton.addEventListener("click", () => {
      this.backward();
    });
    this.items.reloadButton.addEventListener("click", () => {
      this.refresh();
    });
    this.items.forwardButton.addEventListener("click", () => {
      this.forward();
    });

    this.items.inspectButton.addEventListener("click", () => {
      this.inspectelement();
    });

    this.items.extrasButton.addEventListener("click", (event) => {
      this.extrasmenu(event);
    });

    this.items.newTab.addEventListener("click", () =>
      tabs.createTab("daydream://newtab"),
    );
  }

  backward() {
    this.items.activeTabIframe.contentWindow.history.back();
  }

  forward() {
    this.items.activeTabIframe.contentWindow.history.forward();
  }

  refresh() {
    this.items.activeTabIframe.src = this.items.activeTabIframe.src;
  }

  injectErudaScript(iframeDocument) {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve();
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn("Eruda script is already being injected.");
        resolve();
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.src = "/assets/js/lib/eruda/eruda.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve();
      };
      script.onerror = (event) => {
        this.erudaScriptInjecting = false;
        reject(new Error("Failed to load Eruda script:", event));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument) {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.init({
				defaults: {
					displaySize: 50,
					transparency: 0.9,
					theme: 'Material Palenight'
				}
			});
			eruda.show();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  injectHideScript(iframeDocument) {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.hide();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }
  inspectelement() {
    const iframe = this.items.activeTabIframe;
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (iframe.contentWindow.location.href.includes(forbiddenSrcs)) {
      console.warn("Iframe src is forbidden, skipping.");
      return;
    }

    if (iframe.contentWindow.document.readyState == "loading") {
      console.warn(
        "Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck.",
      );
      return;
    }

    this.injectErudaScript(iframeDocument)
      .then(() => {
        if (!this.devToggle) {
          this.injectShowScript(iframeDocument);
        } else {
          this.injectHideScript(iframeDocument);
        }

        this.devToggle = !this.devToggle;
      })
      .catch((error) => {
        console.error("Error injecting Eruda script:", error);
      });

    iframe.contentWindow.addEventListener("unload", () => {
      this.devToggle = false;
      this.erudaScriptLoaded = false;
      this.erudaScriptInjecting = false;
      console.log("Iframe navigation detected, Eruda toggle reset.");
    });
  }

  extrasmenu(e) {
    const elements = {
      items: [
        { pageId: "home", label: "Home" },
        { pageId: "bookmarks", label: "Bookmarks" },
        { pageId: "history", label: "History" },
      ],
      pages: [
        { id: "home", content: "<div>Home Page Content</div>" },
        { id: "bookmarks", content: "<div>Bookmarks Content</div>" },
        { id: "history", content: "<div>History Content</div>" },
      ],
    };

    this.ui.menu.createMenu("Home", "menuDropdown", elements);
  }
}
