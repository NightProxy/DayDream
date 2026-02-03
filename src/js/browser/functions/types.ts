import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { ProfilesAPI } from "@apis/profiles";
import { Protocols } from "@browser/protocols";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Windowing } from "@browser/windowing";
import { EventSystem } from "@apis/events";

export interface FuncInterface {
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
  init(): Promise<void>;
  dispose(): void;
}

export interface NavigationInterface {
  backward(): void;
  forward(): void;
  refresh(): void;
  zoomIn(): void;
  zoomOut(): void;
  scaleIframeContent(): void;
  goFullscreen(): void;
}

export interface DevToolsInterface {
  inspectElement(): void;
  injectErudaScript(iframeDocument: Document): Promise<string>;
  injectShowScript(iframeDocument: Document): Promise<void>;
  injectHideScript(iframeDocument: Document): Promise<void>;
}

export interface MenuInterface {
  menus(): void;
  extensionsMenu(button: HTMLButtonElement): void;
}

export interface ProfileManagerInterface {
  profilesMenu(button: HTMLButtonElement): Promise<void>;
  showCreateProfileDialog(): Promise<void>;
  exportCurrentProfile(): Promise<void>;
  saveCurrentProfile(): Promise<void>;
  switchToProfile(profileId: string): Promise<void>;
  exportProfile(profileId: string): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
  importProfile(): Promise<void>;
  clearCurrentProfileData(): Promise<void>;
}

export interface ModalInterface {
  showAlert(
    message: string,
    type?: "info" | "success" | "error" | "warning",
  ): Promise<void>;
  showConfirm(message: string, title?: string): Promise<boolean>;
  showPrompt(
    message: string,
    defaultValue?: string,
    title?: string,
  ): Promise<string | null>;
}

export interface KeyboardInterface {
  init(): Promise<void>;
}
