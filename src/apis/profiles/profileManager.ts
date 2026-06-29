import type { ProfileData, ProfileAppearance } from "./types";
import { PROFILE_VERSION } from "./constants";
import { SettingsAPI } from "@apis/settings";

export class ProfileManager {
  private canExceedProfileLimit: (() => boolean | Promise<boolean>) | null;
  private maxProfiles: number;
  private profileStore: SettingsAPI;

  constructor(
    canExceedProfileLimit: (() => boolean | Promise<boolean>) | null = null,
    maxProfiles: number = 3,
  ) {
    this.canExceedProfileLimit = canExceedProfileLimit;
    this.maxProfiles = maxProfiles;

    this.profileStore = new SettingsAPI("/data/profiles.json", "/data");
  }

  getStore(): SettingsAPI {
    return this.profileStore;
  }

  async createProfile(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const existingProfile = await this.profileStore.getItem(userID);
    if (existingProfile) {
      throw new Error(`Profile ${userID} already exists`);
    }

    const profiles = await this.listProfiles();
    if (profiles.length >= this.maxProfiles) {
      if (
        !this.canExceedProfileLimit ||
        !(await this.canExceedProfileLimit())
      ) {
        throw new Error(
          `Maximum number of profiles (${this.maxProfiles}) reached. Upgrade to Night+ for unlimited profiles.`,
        );
      }
    }

    const emptyProfile: ProfileData = {
      cookies: {},
      localStorage: {},
      indexedDB: [],
      version: PROFILE_VERSION,
      timestamp: Date.now(),
    };

    await this.profileStore.setItem(userID, emptyProfile);
    return true;
  }

  async createProfileWithData(
    userID: string,
    data: ProfileData,
  ): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const existingProfile = await this.profileStore.getItem(userID);
    if (existingProfile) {
      throw new Error(`Profile ${userID} already exists`);
    }

    const profiles = await this.listProfiles();
    if (profiles.length >= this.maxProfiles) {
      if (
        !this.canExceedProfileLimit ||
        !(await this.canExceedProfileLimit())
      ) {
        throw new Error(
          `Maximum number of profiles (${this.maxProfiles}) reached. Upgrade to Night+ for unlimited profiles.`,
        );
      }
    }

    await this.profileStore.setItem(userID, data);
    return true;
  }

  async deleteProfile(
    userID: string,
    currentProfile: string | null,
  ): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const profile = await this.profileStore.getItem(userID);
    if (!profile) {
      throw new Error(`Profile ${userID} does not exist`);
    }

    if (currentProfile === userID) {
      throw new Error(
        "Cannot delete currently active profile. Switch to another profile first.",
      );
    }

    await this.profileStore.removeItem(userID);
    return true;
  }

  async saveProfile(userID: string, data: ProfileData): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const existingProfile = await this.profileStore.getItem(userID);
    if (!existingProfile) {
      throw new Error(`Profile ${userID} does not exist`);
    }

    await this.profileStore.setItem(userID, data);
    return true;
  }

  async renameProfile(oldId: string, newId: string): Promise<boolean> {
    if (!oldId || !newId || oldId === newId) return false;
    const store = this.getStore();
    const oldData = await store.getItem<ProfileData>(oldId);
    if (!oldData) return false;
    const exists = await store.getItem(newId);
    if (exists) return false; // name collision
    await store.setItem(newId, oldData);
    await store.removeItem(oldId);
    const current = await store.getItem<string>("__current_profile__");
    if (current === oldId) {
      await store.setItem("__current_profile__", newId);
    }
    return true;
  }

  async setAppearance(userID: string, appearance: ProfileAppearance): Promise<boolean> {
    const store = this.getStore();
    const data = await store.getItem<ProfileData>(userID);
    if (!data) return false;
    data.appearance = appearance;
    await store.setItem(userID, data);
    return true;
  }

  async listProfiles(): Promise<string[]> {
    return await this.profileStore.keys();
  }

  async profileExists(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      return false;
    }

    const profile = await this.profileStore.getItem(userID);
    return profile !== null;
  }

  async getProfileData(userID: string): Promise<ProfileData | null> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const profile = await this.profileStore.getItem<ProfileData>(userID);
    return profile;
  }
}
