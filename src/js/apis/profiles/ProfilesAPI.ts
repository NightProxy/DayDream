import { SettingsAPI } from "../settings";
import { ProfileManager } from "./profileManager";
import { StateManager } from "./stateManager";
import { ExportManager } from "./exportManager";
import type { ProfileData, ProfileExport, DatabaseExport } from "./types";
import { getAllIDBData, setIDBDataLegacy } from "./storage/indexedDB";

class ProfilesAPI {
  private currentProfile: string | null;
  private settings: SettingsAPI;
  private profileManager: ProfileManager;
  private stateManager: StateManager;
  private exportManager: ExportManager;

  constructor(
    canExceedProfileLimit: (() => boolean | Promise<boolean>) | null = null,
    maxProfiles: number = 3,
  ) {
    this.currentProfile = null;
    this.settings = new SettingsAPI();
    this.profileManager = new ProfileManager(
      canExceedProfileLimit,
      maxProfiles,
    );
    this.stateManager = new StateManager();
    this.exportManager = new ExportManager(() => this.currentProfile);

    this.initializeCurrentProfile();
  }

  private async initializeCurrentProfile(): Promise<void> {
    try {
      const savedProfile = await this.settings.getItem(
        "__ddx_current_profile__",
      );
      if (savedProfile && (await this.profileExists(savedProfile as string))) {
        this.currentProfile = savedProfile as string;

        const profileData = await this.getProfileData(savedProfile as string);
        if (profileData) {
          await this.stateManager.applyBrowserState(profileData);
        }
      }
    } catch (error) {
      console.error("Failed to initialize current profile:", error);
    }
  }

  private async saveCurrentProfileReference(): Promise<void> {
    try {
      if (this.currentProfile) {
        await this.settings.setItem(
          "__ddx_current_profile__",
          this.currentProfile,
        );
      } else {
        await this.settings.removeItem("__ddx_current_profile__");
      }
    } catch (error) {
      console.error("Failed to save current profile reference:", error);
    }
  }

  async createProfile(userID: string): Promise<boolean> {
    return await this.profileManager.createProfile(userID);
  }

  async createProfileWithCurrentData(userID: string): Promise<boolean> {
    const currentState = await this.stateManager.getCurrentBrowserState();
    const result = await this.profileManager.createProfileWithData(
      userID,
      currentState,
    );

    this.currentProfile = userID;
    await this.saveCurrentProfileReference();

    return result;
  }

  async deleteProfile(userID: string): Promise<boolean> {
    return await this.profileManager.deleteProfile(userID, this.currentProfile);
  }

  async saveProfile(userID: string): Promise<boolean> {
    const currentState = await this.stateManager.getCurrentBrowserState();
    return await this.profileManager.saveProfile(userID, currentState);
  }

  async switchProfile(
    userID: string,
    skipCurrentSave: boolean = false,
  ): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const targetProfile = await this.profileManager.getProfileData(userID);
    if (!targetProfile) {
      throw new Error(`Profile ${userID} does not exist`);
    }

    if (this.currentProfile && !skipCurrentSave) {
      await this.saveProfile(this.currentProfile);
    }

    await this.stateManager.applyBrowserState(targetProfile);

    this.currentProfile = userID;
    await this.saveCurrentProfileReference();

    return true;
  }

  async listProfiles(): Promise<string[]> {
    return await this.profileManager.listProfiles();
  }

  getCurrentProfile(): string | null {
    return this.currentProfile;
  }

  async profileExists(userID: string): Promise<boolean> {
    return await this.profileManager.profileExists(userID);
  }

  async getProfileData(userID: string): Promise<ProfileData | null> {
    return await this.profileManager.getProfileData(userID);
  }

  async getCurrentBrowserState(): Promise<ProfileData> {
    return await this.stateManager.getCurrentBrowserState();
  }

  async applyBrowserState(state: ProfileData): Promise<void> {
    return await this.stateManager.applyBrowserState(state);
  }

  async clearCurrentProfileData(): Promise<boolean> {
    return await this.stateManager.clearCurrentProfileData();
  }

  async flushStorageOperations(): Promise<void> {
    return await this.stateManager.flushStorageOperations();
  }

  emergencySaveProfile(userID: string): boolean {
    return this.stateManager.emergencySaveProfile(userID);
  }

  async exportCurrentProfile(): Promise<ProfileExport> {
    return await this.exportManager.exportCurrentProfile();
  }

  async downloadExport(filename: string | null = null): Promise<boolean> {
    return await this.exportManager.downloadExport(filename);
  }

  encode(data: any): string {
    return this.exportManager.encode(data);
  }

  decode(encodedData: string): any {
    return this.exportManager.decode(encodedData);
  }

  async exportIndexedDBs(): Promise<DatabaseExport[]> {
    return await getAllIDBData();
  }

  async setIDBDataLegacy(data: Record<string, any>): Promise<void> {
    return await setIDBDataLegacy(data);
  }

  async getAllCookies(): Promise<Record<string, string>> {
    const { getAllCookies } = await import("./storage/cookies");
    return await getAllCookies();
  }

  async setCookies(cookies: Record<string, string>): Promise<void> {
    const { setCookies } = await import("./storage/cookies");
    return await setCookies(cookies);
  }

  async clearAllCookies(): Promise<void> {
    const { clearAllCookies } = await import("./storage/cookies");
    return await clearAllCookies();
  }

  async getAllLocalStorage(): Promise<Record<string, string>> {
    const { getAllLocalStorage } = await import("./storage/localStorage");
    return await getAllLocalStorage();
  }

  async setLocalStorage(data: Record<string, string>): Promise<void> {
    const { setLocalStorage } = await import("./storage/localStorage");
    return await setLocalStorage(data);
  }

  async clearAllLocalStorage(): Promise<void> {
    const { clearAllLocalStorage } = await import("./storage/localStorage");
    return await clearAllLocalStorage();
  }

  async getAllIDBData(): Promise<DatabaseExport[]> {
    const { getAllIDBData } = await import("./storage/indexedDB");
    return await getAllIDBData();
  }

  async setIDBData(databases: DatabaseExport[]): Promise<void> {
    const { setIDBData } = await import("./storage/indexedDB");
    return await setIDBData(databases);
  }

  async clearAllIDB(): Promise<void> {
    const { clearAllIDB } = await import("./storage/indexedDB");
    return await clearAllIDB();
  }
}

export { ProfilesAPI };
