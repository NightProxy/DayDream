import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { ProfilesAPI } from "@apis/profiles";
import { Protocols } from "@browser/protocols";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";
import { FuncInterface } from "./types";
import { Navigation } from "./navigation";
import { DevTools } from "./devTools";
import { MenuManager } from "./menuManager";
import { ProfileManager } from "./profileManager";
import { ModalUtilities } from "./modalUtilities";
import { KeyboardManager } from "./keyboardManager";

class Functions implements FuncInterface {
  tabs: any;
  items: Items;
  ui: UI;
  logger: Logger;
  settings: SettingsAPI;
  profiles: ProfilesAPI;
  proto: Protocols;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;
  devToggle: boolean;
  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;
  public readonly initPromise: Promise<void>;
  private autoSaveIntervalId: number | null = null;

  private navigation: Navigation;
  private devTools: DevTools;
  private menuManager: MenuManager;
  private profileManager: ProfileManager;
  private modalUtilities: ModalUtilities;
  private keyboardManager: KeyboardManager;

  constructor(tabs: any, proto: any) {
    this.items = new Items();
    this.ui = new UI();
    this.tabs = tabs!;
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.profiles = new ProfilesAPI();
    this.proto = proto;
    this.nightmarePlugins = new NightmarePlugins();
    this.windowing = new Windowing();
    this.events = new EventSystem();

    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
    this.zoomLevel = 1;
    this.zoomSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this.currentStep = 4;

    this.modalUtilities = new ModalUtilities(this.ui);

    this.navigation = new Navigation(
      this.items,
      this.zoomSteps,
      this.currentStep,
    );

    this.devTools = new DevTools(
      this.logger,
      this.items,
      this.devToggle,
      this.erudaScriptLoaded,
      this.erudaScriptInjecting,
    );

    this.menuManager = new MenuManager(
      this.items,
      this.ui,
      this.nightmarePlugins,
    );

    this.profileManager = new ProfileManager(
      this.profiles,
      this.logger,
      this.items,
      this.proto,
      this.ui,
      this.nightmarePlugins,
      this.modalUtilities,
    );

    this.keyboardManager = new KeyboardManager(
      this.tabs,
      this.settings,
      this.events,
      this.devTools,
    );

    this.initPromise = this.profiles.initPromise;
  }

  async init(): Promise<void> {
    this.items.backButton!.addEventListener("click", () => {
      this.navigation.backward();
    });

    this.items.reloadButton!.addEventListener("click", () => {
      this.navigation.refresh();
    });

    this.items.forwardButton!.addEventListener("click", () => {
      this.navigation.forward();
    });

    this.menuManager.menus();

    this.items.newTab!.addEventListener(
      "click",
      async () => await this.tabs.createTab("ddx://newtab/"),
    );

    if (this.items.profilesButton) {
      this.profileManager.profilesMenu(this.items.profilesButton);
    }

    await this.keyboardManager.init();

    this.setupAutoSave();
  }

  private setupAutoSave(): void {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let saveTimeout: NodeJS.Timeout | null = null;

    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);

      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      saveTimeout = setTimeout(async () => {
        const currentProfile = this.profiles.getCurrentProfile();
        if (currentProfile) {
          try {
            console.log(
              `🔄 Auto-save triggered by localStorage change (key: ${key})`,
            );
            await this.profiles.saveProfile(currentProfile);
            console.log(`✅ Auto-save completed after localStorage change`);
          } catch (error) {
            console.warn(
              "Failed to auto-save after localStorage change:",
              error,
            );
          }
        }
      }, 1000);
    };

    window.addEventListener("beforeunload", () => {
      const currentProfile = this.profiles.getCurrentProfile();

      if (currentProfile) {
        try {
          console.log(
            `🔄 Emergency save on beforeunload for profile: ${currentProfile}`,
          );

          const emergencySuccess =
            this.profiles.emergencySaveProfile(currentProfile);

          if (emergencySuccess) {
            console.log(
              `✅ Emergency save completed for profile: ${currentProfile}`,
            );
          }

          this.profiles.saveProfile(currentProfile).catch((error) => {
            console.warn("Background save failed during beforeunload:", error);
          });
        } catch (error) {
          console.warn("Failed to emergency save profile data:", error);
        }
      }
    });

    window.addEventListener("pagehide", () => {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile) {
        try {
          console.log(
            `🔄 Emergency save on pagehide for profile: ${currentProfile}`,
          );

          const emergencySuccess =
            this.profiles.emergencySaveProfile(currentProfile);

          if (emergencySuccess) {
            console.log(
              `✅ Emergency save on pagehide completed for profile: ${currentProfile}`,
            );
          }

          this.profiles.saveProfile(currentProfile).catch((error) => {
            console.warn("Background save failed during pagehide:", error);
          });
        } catch (error) {
          console.warn("Failed to emergency save profile on pagehide:", error);
        }
      }
    });

    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) {
        const currentProfile = this.profiles.getCurrentProfile();
        if (currentProfile) {
          try {
            await this.profiles.saveProfile(currentProfile);
            this.logger.createLog(
              `Auto-saved profile on visibility change: ${currentProfile}`,
            );
          } catch (error) {
            console.warn(
              "Failed to auto-save profile on visibility change:",
              error,
            );
          }
        }
      }
    });

    if (this.autoSaveIntervalId !== null) {
      clearInterval(this.autoSaveIntervalId);
    }

    this.autoSaveIntervalId = window.setInterval(async () => {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile) {
        try {
          await this.profiles.saveProfile(currentProfile);
          this.logger.createLog(
            `Auto-saved profile (periodic): ${currentProfile}`,
          );
        } catch (error) {
          console.warn("Failed to perform periodic profile save:", error);
        }
      }
    }, 30000);
  }

  dispose(): void {
    if (this.autoSaveIntervalId !== null) {
      clearInterval(this.autoSaveIntervalId);
      this.autoSaveIntervalId = null;
    }
  }

  backward(): void {
    this.navigation.backward();
  }

  forward(): void {
    this.navigation.forward();
  }

  refresh(): void {
    this.navigation.refresh();
  }

  zoomIn(): void {
    this.navigation.zoomIn();
    this.zoomLevel = this.navigation.getCurrentZoomLevel();
    this.currentStep = this.navigation.getCurrentStep();
    this.navigation.updateZoomState(this.zoomLevel, this.currentStep);
  }

  zoomOut(): void {
    this.navigation.zoomOut();
    this.zoomLevel = this.navigation.getCurrentZoomLevel();
    this.currentStep = this.navigation.getCurrentStep();
    this.navigation.updateZoomState(this.zoomLevel, this.currentStep);
  }

  scaleIframeContent(): void {
    this.navigation.scaleIframeContent();
  }

  goFullscreen(): void {
    this.navigation.goFullscreen();
  }

  inspectElement(): void {
    this.devTools.inspectElement();
    this.devToggle = this.devTools.getDevToggle();
    this.erudaScriptLoaded = this.devTools.getErudaScriptLoaded();
    this.erudaScriptInjecting = this.devTools.getErudaScriptInjecting();
    this.devTools.updateDevState(
      this.devToggle,
      this.erudaScriptLoaded,
      this.erudaScriptInjecting,
    );
  }

  toggleChiiInspect(): void {
    this.tabs.toggleChiiDevTools();
  }

  injectErudaScript(iframeDocument: Document): Promise<string> {
    return this.devTools.injectErudaScript(iframeDocument);
  }

  injectShowScript(iframeDocument: Document): Promise<void> {
    return this.devTools.injectShowScript(iframeDocument);
  }

  injectHideScript(iframeDocument: Document): Promise<void> {
    return this.devTools.injectHideScript(iframeDocument);
  }

  menus(): void {
    this.menuManager.menus();
  }

  extensionsMenu(button: HTMLButtonElement): void {
    this.menuManager.extensionsMenu(button);
  }

  async profilesMenu(button: HTMLButtonElement): Promise<void> {
    await this.profileManager.profilesMenu(button);
  }

  async showCreateProfileDialog(): Promise<void> {
    await this.profileManager.showCreateProfileDialog();
  }

  async exportCurrentProfile(): Promise<void> {
    await this.profileManager.exportCurrentProfile();
  }

  async saveCurrentProfile(): Promise<void> {
    await this.profileManager.saveCurrentProfile();
  }

  async switchToProfile(profileId: string): Promise<void> {
    await this.profileManager.switchToProfile(profileId);
  }

  async exportProfile(profileId: string): Promise<void> {
    await this.profileManager.exportProfile(profileId);
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.profileManager.deleteProfile(profileId);
  }

  async importProfile(): Promise<void> {
    await this.profileManager.importProfile();
  }

  async clearCurrentProfileData(): Promise<void> {
    await this.profileManager.clearCurrentProfileData();
  }

  async createTestData(): Promise<void> {
    await this.profileManager.createTestData();
  }

  async inspectCurrentData(): Promise<any> {
    return await this.profileManager.inspectCurrentData();
  }

  async inspectProfileData(profileId: string): Promise<any> {
    return await this.profileManager.inspectProfileData(profileId);
  }

  navbarfunctions(): void {
    const navbar = document.querySelector(".navbar");
    if (!navbar) {
      console.warn("Navbar element not found");
      return;
    }

    const games = navbar.querySelector("#gamesShortcut");
    const chat = navbar.querySelector(
      "#chatShortcut",
    ) as HTMLButtonElement | null;
    const history = navbar.querySelector("#historyShortcut");
    const settings = navbar.querySelector("#settShortcut");

    if (games) {
      games.addEventListener("click", async () => {
        const url =
          (await this.proto.processUrl("ddx://games/")) || "/internal/error/";
        const iframe = this.items.frameContainer?.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;

        if (iframe) {
          iframe.setAttribute("src", url);
        } else {
          console.warn("No active iframe found for games shortcut");
        }
      });
    }

    if (chat) {
      chat.addEventListener("click", async () => {
        window.open("https://discord.night-x.com", "_blank");
      });
    }

    if (history) {
      history.addEventListener("click", async () => {
        const url =
          (await this.proto.processUrl("ddx://history/")) || "/internal/error/";
        const iframe = this.items.frameContainer?.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;

        if (iframe) {
          iframe.setAttribute("src", url);
        } else {
          console.warn("No active iframe found for history shortcut");
        }
      });
    }

    if (settings) {
      settings.addEventListener("click", async () => {
        const url =
          (await this.proto.processUrl("ddx://settings/")) ||
          "/internal/error/";
        const iframe = this.items.frameContainer?.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;

        if (iframe) {
          iframe.setAttribute("src", url);
        } else {
          console.warn("No active iframe found for settings shortcut");
        }
      });
    }
  }
}

export { Functions };
