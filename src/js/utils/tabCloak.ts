import { SettingsAPI } from "@apis/settings";

export interface TabCloakSettings {
  title: string;
  favicon: string;
  disableTabClose: boolean;
}

export class TabCloakManager {
  private settings: SettingsAPI;

  constructor() {
    this.settings = new SettingsAPI();
  }

  async applyTabCloak(
    _targetWindow?: Window,
    targetDocument?: Document,
  ): Promise<void> {
    const doc = targetDocument || document;

    try {
      const tabCloakId = (await this.settings.getItem("tabCloak")) || "off";

      if (tabCloakId === "off") {
        console.log("Tab cloak is disabled");
        return;
      }

      let title = "";
      let favicon = "";

      if (tabCloakId === "custom") {
        title = (await this.settings.getItem("customTabTitle")) || "";
        favicon = (await this.settings.getItem("customTabFavicon")) || "";
      } else {
        title = (await this.settings.getItem("tabCloakTitle")) || "";
        favicon = (await this.settings.getItem("tabCloakFavicon")) || "";
      }

      if (title) {
        doc.title = title;
        console.log("Applied tab title:", title);
      }

      if (favicon) {
        let link = doc.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = doc.createElement("link");
          link.rel = "icon";
          doc.head.appendChild(link);
        }
        link.href = favicon;
        console.log("Applied tab favicon:", favicon);
      }
    } catch (error) {
      console.error("Error applying tab cloak:", error);
    }
  }

  async applyDisableTabClose(targetWindow?: Window): Promise<void> {
    const win = targetWindow || window;

    try {
      const disableTabClose =
        (await this.settings.getItem("disableTabClose")) || "true";

      if (disableTabClose === "true") {
        win.addEventListener("beforeunload", (e) => {
          e.preventDefault();
          e.returnValue = "";
        });
        console.log("Applied disable tab close listener");
      }
    } catch (error) {
      console.error("Error applying disable tab close:", error);
    }
  }

  async applyAll(
    targetWindow?: Window,
    targetDocument?: Document,
  ): Promise<void> {
    await this.applyTabCloak(targetWindow, targetDocument);
    await this.applyDisableTabClose(targetWindow);
  }

  async getSettings(): Promise<TabCloakSettings> {
    const tabCloakId = (await this.settings.getItem("tabCloak")) || "off";
    let title = "";
    let favicon = "";

    if (tabCloakId === "custom") {
      title = (await this.settings.getItem("customTabTitle")) || "";
      favicon = (await this.settings.getItem("customTabFavicon")) || "";
    } else {
      title = (await this.settings.getItem("tabCloakTitle")) || "";
      favicon = (await this.settings.getItem("tabCloakFavicon")) || "";
    }

    const disableTabClose =
      ((await this.settings.getItem("disableTabClose")) || "true") === "true";

    return {
      title,
      favicon,
      disableTabClose,
    };
  }
}

export const tabCloakManager = new TabCloakManager();
