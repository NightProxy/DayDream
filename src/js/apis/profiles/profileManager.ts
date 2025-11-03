import localforage from "localforage";
import type { ProfileData } from "./types";
import { PROFILE_VERSION } from "./constants";

export class ProfileManager {
  private canExceedProfileLimit: (() => boolean) | null;
  private maxProfiles: number;
  private profileStore: LocalForage;

  constructor(
    canExceedProfileLimit: (() => boolean) | null = null,
    maxProfiles: number = 3,
  ) {
    this.canExceedProfileLimit = canExceedProfileLimit;
    this.maxProfiles = maxProfiles;

    this.profileStore = localforage.createInstance({
      name: "Profiles",
      storeName: "profiles_v2",
    });
  }

  getStore(): LocalForage {
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
      if (!this.canExceedProfileLimit || !this.canExceedProfileLimit()) {
        throw new Error(
          `Maximum number of profiles (${this.maxProfiles}) reached`,
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
      if (!this.canExceedProfileLimit || !this.canExceedProfileLimit()) {
        throw new Error(
          `Maximum number of profiles (${this.maxProfiles}) reached`,
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
