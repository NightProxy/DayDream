import { SettingsAPI } from "@apis/settings";
import { resolvePath } from "@utils/basepath";

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
      // Legacy selector — "off" | "custom" | <preset id>.
      const tabCloakId = (await this.settings.getItem("tabCloak")) || "off";

      // New T15 toggle. Privacy → Cloaking writes "true"/"false"
      // strings via writeMap, but accept boolean defensively.
      const autoCloakRaw = await this.settings.getItem("autoCloak");
      const autoCloakOn =
        autoCloakRaw === "true" || autoCloakRaw === true;

      // New T15 URL-cloak boolean — currently no-op at this layer
      // because the Tab class exposes no setDisplayUrl hook. Wired here
      // so the read is visible to future implementers; favicon/title
      // application below is reused when urlCloak is on so the user
      // still gets disguised tab metadata even without URL hiding.
      const urlCloakRaw = await this.settings.getItem("urlCloak");
      const urlCloakOn = urlCloakRaw === true || urlCloakRaw === "true";
      if (urlCloakOn) {
        // No-op: the Tab/Frame layer has no setDisplayUrl method
        // (see src/browser/tabs/types.ts). Tracked for a follow-up.
        console.log(
          "[tabCloak] urlCloak is enabled but no display-URL hook exists yet",
        );
      }

      // If neither the legacy selector nor the new autoCloak toggle
      // are active, restore defaults and exit.
      if (tabCloakId === "off" && !autoCloakOn) {
        console.log("Tab cloak is disabled, restoring defaults");
        doc.title = "DayDream X";
        let link = doc.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = doc.createElement("link");
          link.rel = "icon";
          doc.head.appendChild(link);
        }
        link.href = resolvePath("res/logo.png");
        return;
      }

      let title = "";
      let favicon = "";

      if (tabCloakId === "custom") {
        // Legacy custom preset path — keep using legacy keys.
        title = (await this.settings.getItem("customTabTitle")) || "";
        favicon = (await this.settings.getItem("customTabFavicon")) || "";
      } else if (tabCloakId !== "off") {
        // Legacy preset path.
        title = (await this.settings.getItem("tabCloakTitle")) || "";
        favicon = (await this.settings.getItem("tabCloakFavicon")) || "";
      }

      // New T15 keys — when autoCloak is on (or when the user has
      // configured custom values via the Cloaking → Editor subpage),
      // these override anything from the legacy presets.
      if (autoCloakOn) {
        const newTitle =
          (await this.settings.getItem("customTitle")) || "";
        const newFavicon =
          (await this.settings.getItem("customFavicon")) || "";
        if (newTitle) title = newTitle;
        if (newFavicon) favicon = newFavicon;
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
