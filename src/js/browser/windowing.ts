import { SettingsAPI } from "@apis/settings";
import { tabCloakManager } from "@js/utils/tabCloak";

interface WindowingInterface {
  settings: SettingsAPI;
}

class Windowing implements WindowingInterface {
  settings: SettingsAPI;
  constructor() {
    this.settings = new SettingsAPI();
  }

  newWindow() {
    const currentUrl = location.href;

    window.open(currentUrl, "_blank", "noopener,noreferrer");
  }

  async aboutBlankWindow() {
    if (window === window.top) {
      const aboutBlankTab = window.open("about:blank", "_blank");
      const iframe = document.createElement("iframe");
      iframe.src = location.href;
      iframe.setAttribute(
        "style",
        "width: 100%; height: 100%; border: none; position: fixed; inset: 0px; outline: none; scrolling: auto;",
      );

      const cloakSettings = await tabCloakManager.getSettings();

      aboutBlankTab!.document.title = cloakSettings.title || document.title;
      const link = aboutBlankTab!.document.createElement("link");
      link.rel = "icon";
      link.type = "image/x-icon";
      link.href =
        cloakSettings.favicon ||
        (await this.settings.getItem("favicon")) ||
        location.href + "/res/logo.png";

      if (cloakSettings.disableTabClose) {
        aboutBlankTab!.window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });
      }

      aboutBlankTab!.document.head.appendChild(link);
      aboutBlankTab!.document.body.appendChild(iframe);
    } else {
      console.log("already in about:blank or iframe");
    }
  }

  async aboutBlank() {
    if (window === window.top) {
      const aboutBlankTab = window.open("about:blank");
      const iframe = document.createElement("iframe");
      iframe.src = location.href;
      iframe.setAttribute(
        "style",
        "width: 100%; height: 100%; border: none; position: fixed; inset: 0px; outline: none; scrolling: auto;",
      );

      const cloakSettings = await tabCloakManager.getSettings();

      aboutBlankTab!.document.title = cloakSettings.title || document.title;
      const link = aboutBlankTab!.document.createElement("link");
      link.rel = "icon";
      link.type = "image/x-icon";
      link.href =
        cloakSettings.favicon ||
        (await this.settings.getItem("favicon")) ||
        location.href + "/res/logo.png";

      if (cloakSettings.disableTabClose) {
        aboutBlankTab!.window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });

        window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });
      }

      aboutBlankTab!.document.head.appendChild(link);
      aboutBlankTab!.document.body.appendChild(iframe);

      window.location.href =
        (await this.settings.getItem("redirectUrl")) || "https://google.com";
    } else {
      console.log("already in about:blank or iframe");
    }
  }

  async aboutBlankGGWIndow() {
    if (window === window.top) {
      const aboutBlankTab = window.open("about:blank", "_blank");
      const docMain = aboutBlankTab!.document;

      const cloakSettings = await tabCloakManager.getSettings();
      const title = cloakSettings.title || document.title;
      const favicon =
        cloakSettings.favicon ||
        (await this.settings.getItem("favicon")) ||
        location.href + "/res/logo.png";
      const beforeUnloadScript = cloakSettings.disableTabClose
        ? `window.addEventListener("beforeunload", function(event) {
            event.preventDefault();
            event.returnValue = "";
          });`
        : "";

      docMain.write(`
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <link rel="icon" type="image/x-icon" href="${favicon}">
  <script>
    ${beforeUnloadScript}
  </script>
</head>
<body style="margin: 0; padding: 0; height: 100%; overflow: hidden;">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      position: fixed;
      inset: 0px;
      outline: none;
      scrolling: auto;
    }
  </style>
  <iframe id="main" frameborder="0" style="width:100%; height:100%; border:none; position:fixed; inset:0px; outline:none; scrolling:auto;"></iframe>
        <script>
          const iframe = document.getElementById("main");
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const objectElement = doc.createElement("object");
          objectElement.type = "text/html";
          objectElement.style.cssText = "width: 100%; height: 100%; border: none; position: fixed; inset: 0px; outline: none; scrolling: auto;";
          objectElement.data = ${JSON.stringify(location.href)};
          doc.body.appendChild(objectElement);
        </script>
</body>
</html>
      `);
    } else {
      console.log("already in about:blank or iframe");
    }
  }

  async BlobWindow() {
    if (window === window.top) {
      const cloakSettings = await tabCloakManager.getSettings();
      const targetUrl = location.href;

      const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                  <style>
                      body, html {
                          margin: 0;
                          padding: 0;
                          height: 100%;
                          overflow: hidden;
                      }
                      iframe {
                          width: 100%;
                          height: 100%;
                          border: none;
                      }
                  </style>
              </head>
              <body>
                  <iframe id="main" frameborder="0"></iframe>
                  <script>
                      const iframe = document.getElementById("main");
                      iframe.src = ${JSON.stringify(targetUrl)};
                  </script>
              </body>
              </html>
          `;

      const blob = new Blob([htmlContent], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);

      const blobPage = window.open(blobUrl, "_blank");

      if (cloakSettings.disableTabClose) {
        blobPage!.window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });
      }
    } else {
      console.log("already in blob or iframe");
    }
  }

  async BlobWindowGG() {
    if (window === window.top) {
      const originalUrl = window.location.href;

      const cloakSettings = await tabCloakManager.getSettings();

      const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body, html {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        overflow: hidden;
                    }
                    iframe {
                        width: 100%;
                        height: 100%;
                        border: none;
                    }
                </style>
            </head>
            <body>
                <iframe id="main" frameborder="0"></iframe>
                <script>
                    const iframe = document.getElementById("main");
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    const objectElement = doc.createElement("object");
                    objectElement.type = "text/html";
                    objectElement.style.cssText = "width: 100%; height: 100%; border: none; position: fixed; inset: 0px; outline: none; scrolling: auto;";
                    objectElement.data = ${JSON.stringify(originalUrl)};
                    doc.body.appendChild(objectElement);
                </script>
            </body>
            </html>
        `;

      const blob = new Blob([htmlContent], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);

      const blobPage = window.open(blobUrl, "_blank");

      if (cloakSettings.disableTabClose) {
        blobPage!.window.addEventListener("beforeunload", (event) => {
          event.preventDefault();
          event.returnValue = "";
        });
      }
    } else {
      console.log("already in blob or iframe");
    }
  }
}

export { Windowing };
