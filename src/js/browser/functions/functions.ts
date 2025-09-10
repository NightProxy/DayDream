import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { ProfilesAPI } from "@apis/profiles";
import { Protocols } from "@browser/protocols";
import { Utils } from "@js/utils";
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
  utils: Utils;
  nightmarePlugins: NightmarePlugins;
  windowing: Windowing;
  events: EventSystem;

  devToggle: boolean;
  erudaScriptLoaded: boolean;
  erudaScriptInjecting: boolean;
  zoomLevel: number;
  zoomSteps: Array<number>;
  currentStep: number;

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
    this.utils = new Utils();
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
      this.zoomLevel,
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
  }

  init(): void {
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

    this.keyboardManager.init();

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

    window.addEventListener("beforeunload", async () => {
      const currentProfile = this.profiles.getCurrentProfile();

      if (currentProfile) {
        try {
          console.log(
            `🔄 Emergency save on beforeunload for profile: ${currentProfile}`,
          );

          const asyncSavePromise = this.profiles.saveProfile(currentProfile);
          const emergencySuccess =
            this.profiles.emergencySaveProfile(currentProfile);

          if (emergencySuccess) {
            console.log(
              `✅ Emergency save completed for profile: ${currentProfile}`,
            );
          }

          const timeoutPromise = new Promise((resolve) =>
            setTimeout(resolve, 500),
          );
          await Promise.race([asyncSavePromise, timeoutPromise]);

          this.logger.createLog(`Auto-saved profile: ${currentProfile}`);
        } catch (error) {
          console.warn("Failed to auto-save profile data:", error);

          this.profiles.emergencySaveProfile(currentProfile);
        }
      }
    });

    window.addEventListener("pagehide", async () => {
      const currentProfile = this.profiles.getCurrentProfile();
      if (currentProfile) {
        try {
          console.log(
            `🔄 Emergency save on pagehide for profile: ${currentProfile}`,
          );
          await this.profiles.saveProfile(currentProfile);
          console.log(
            `✅ Emergency save on pagehide completed for profile: ${currentProfile}`,
          );
          this.logger.createLog(
            `Auto-saved profile on pagehide: ${currentProfile}`,
          );
        } catch (error) {
          console.warn("Failed to auto-save profile on pagehide:", error);
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

    setInterval(async () => {
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
    const games = navbar!.querySelector("#gamesShortcut");
    const chat = navbar!.querySelector("#chatShortcut") as HTMLButtonElement;
    const history = navbar!.querySelector("#historyShortcut");
    const settings = navbar!.querySelector("#settShortcut");

    games!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("ddx://games/")) || "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    chat!.addEventListener("click", async () => {
      window.open("https://discord.night-x.com", "_blank");
    });

    history!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("ddx://history/")) || "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });

    settings!.addEventListener("click", async () => {
      const url =
        (await this.proto.processUrl("ddx://settings/")) || "/internal/error/";
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      iframe!.setAttribute("src", url);
    });
  }
}

export { Functions };
