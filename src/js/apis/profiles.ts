import localforage from "localforage";

interface ProfileData {
  Cookies: string;
  LocalStorage: string;
  IDB: string;
}

interface DatabaseExport {
  name: string;
  data: Record<string, any[]>;
}

interface ProfileExport {
  profileId: string | null;
  timestamp: string;
  indexedDB: DatabaseExport[];
  localStorage: Record<string, string>;
  cookies: Record<string, string>;
}

class ProfilesAPI {
  private canExceedProfileLimit: (() => boolean) | null;
  private maxProfiles: number;
  private currentProfile: string | null;
  private profileStore: LocalForage;
  private idbStore: LocalForage;

  constructor(
    canExceedProfileLimit: (() => boolean) | null = null,
    maxProfiles: number = 3,
  ) {
    this.canExceedProfileLimit = canExceedProfileLimit;
    this.maxProfiles = maxProfiles;
    this.currentProfile = null;

    this.profileStore = localforage.createInstance({
      name: "Profiles",
      storeName: "profiles",
    });

    this.idbStore = localforage.createInstance({
      name: "ProfileIDB",
      storeName: "current_profile_idb",
    });
  }

  encode(data: any): string {
    return JSON.stringify(data);
  }

  decode(encodedData: string): any {
    try {
      return JSON.parse(encodedData);
    } catch (e) {
      return null;
    }
  }

  async getAllCookies(): Promise<Record<string, string>> {
    const cookies: Record<string, string> = {};
    const cookieString = document.cookie;

    if (cookieString && cookieString.trim()) {
      cookieString.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name && name.trim()) {
          cookies[name.trim()] = rest.join("=");
        }
      });
    }

    return cookies;
  }

  async setCookies(cookies: Record<string, string>): Promise<void> {
    Object.entries(cookies).forEach(([name, value]) => {
      document.cookie = `${name}=${value}; path=/`;
    });
  }

  async clearAllCookies(): Promise<void> {
    const cookies = await this.getAllCookies();
    Object.keys(cookies).forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    });
  }

  async getAllLocalStorage(): Promise<Record<string, string>> {
    const data: Record<string, string> = {};

    try {
      Object.keys(localStorage).forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data[key] = value;
        }
      });
    } catch (e) {
      console.error("Error collecting localStorage:", e);
    }

    return data;
  }

  async setLocalStorage(data: Record<string, string>): Promise<void> {
    Object.entries(data).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  }

  async clearAllLocalStorage() {
    localStorage.clear();
  }

  async getAllIDBData(): Promise<Record<string, any>> {
    try {
      const databases = await indexedDB.databases();

      const systemDatabases = ["Profiles", "ProfileIDB"];

      const userDatabases = databases.filter((db) => {
        const dbName = db.name || "";
        return !systemDatabases.includes(dbName);
      });

      const data: Record<string, any> = {};

      for (const dbInfo of userDatabases) {
        try {
          const dbExport = await this.exportSingleDatabase(dbInfo.name || "");
          if (dbExport && dbInfo.name) {
            data[dbInfo.name] = dbExport.data;
          }
        } catch (error) {
          console.warn(
            `Failed to export database ${dbInfo.name} for profile save:`,
            error,
          );
        }
      }

      return data;
    } catch (error) {
      console.error("Failed to get IndexedDB data for profile:", error);
      return {};
    }
  }

  async setIDBData(data: Record<string, any>): Promise<void> {
    try {
      await this.clearAllIDB();

      for (const [dbName, dbData] of Object.entries(data)) {
        if (
          typeof dbData === "object" &&
          dbData !== null &&
          !Array.isArray(dbData)
        ) {
          const storeKeys = Object.keys(dbData);
          const hasData = storeKeys.some(
            (key) => Array.isArray(dbData[key]) && dbData[key].length > 0,
          );

          if (hasData) {
            try {
              await this.restoreDatabase(dbName, dbData);
            } catch (error) {
              console.error(`Failed to restore database ${dbName}:`, error);
            }
          }
        } else {
          await this.idbStore.setItem(dbName, dbData);
        }
      }
    } catch (error) {
      console.error("Failed to set IndexedDB data:", error);

      for (const [key, value] of Object.entries(data)) {
        try {
          await this.idbStore.setItem(key, value);
        } catch (fallbackError) {
          console.error(`Fallback failed for ${key}:`, fallbackError);
        }
      }
    }
  }

  async clearAllIDB(): Promise<void> {
    try {
      const databases = await indexedDB.databases();

      const systemDatabases = ["Profiles", "ProfileIDB"];

      const userDatabases = databases.filter((db) => {
        const dbName = db.name || "";
        return !systemDatabases.includes(dbName);
      });

      for (const dbInfo of userDatabases) {
        try {
          if (dbInfo.name) {
            await new Promise<boolean>((resolve) => {
              const deleteRequest = indexedDB.deleteDatabase(dbInfo.name!);

              let resolved = false;

              deleteRequest.onsuccess = () => {
                if (!resolved) {
                  resolved = true;
                  resolve(true);
                }
              };
              deleteRequest.onerror = () => {
                if (!resolved) {
                  resolved = true;
                  resolve(false);
                }
              };
              deleteRequest.onblocked = () => {
                if (!resolved) {
                  resolved = true;
                  resolve(false);
                }
              };

              setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  resolve(false);
                }
              }, 1000);
            });
          }
        } catch (error) {
          console.warn(`Error deleting database ${dbInfo.name}:`, error);
        }
      }
    } catch (error) {
      console.error("Failed to clear IndexedDB:", error);
    }
  }

  async restoreDatabase(
    dbName: string,
    dbData: Record<string, any[]>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let completed = false;

      const timeout = setTimeout(() => {
        if (!completed) {
          console.warn(
            `Timeout opening ${dbName} after 5 seconds, skipping restoration`,
          );
          completed = true;
          resolve(false);
        }
      }, 5000);

      const version = Date.now() + Math.floor(Math.random() * 1000);
      const request = indexedDB.open(dbName, version);

      request.onerror = () => {
        console.error(`Failed to open database ${dbName}:`, request.error);
        if (!completed) {
          completed = true;
          clearTimeout(timeout);
          resolve(false);
        }
      };

      request.onblocked = () => {};

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          for (const [storeName, storeData] of Object.entries(dbData)) {
            if (!db.objectStoreNames.contains(storeName)) {
              if (Array.isArray(storeData) && storeData.length > 0) {
                const firstItem = storeData[0];

                if (
                  firstItem &&
                  typeof firstItem === "object" &&
                  "key" in firstItem &&
                  "value" in firstItem
                ) {
                  db.createObjectStore(storeName);
                } else {
                  const hasId =
                    firstItem &&
                    typeof firstItem === "object" &&
                    "id" in firstItem;

                  if (hasId) {
                    db.createObjectStore(storeName, {
                      keyPath: "id",
                      autoIncrement: true,
                    });
                  } else {
                    db.createObjectStore(storeName, { autoIncrement: true });
                  }
                }
              } else {
                db.createObjectStore(storeName);
              }
            }
          }
        } catch (error) {
          console.error(`Error in onupgradeneeded for ${dbName}:`, error);
          if (!completed) {
            completed = true;
            clearTimeout(timeout);
            resolve(false);
          }
        }
      };

      request.onsuccess = async (event: Event) => {
        if (completed) {
          const db = (event.target as IDBOpenDBRequest).result;
          db.close();
          return;
        }

        const db = (event.target as IDBOpenDBRequest).result;

        try {
          const storeNames = Object.keys(dbData);
          if (storeNames.length === 0) {
            completed = true;
            clearTimeout(timeout);
            db.close();
            resolve(true);
            return;
          }

          const transaction = db.transaction(storeNames, "readwrite");

          transaction.oncomplete = () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              db.close();
              resolve(true);
            } else {
              db.close();
            }
          };

          transaction.onerror = () => {
            console.error(
              `Transaction failed for ${dbName}:`,
              transaction.error,
            );
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              db.close();
              resolve(false);
            } else {
              db.close();
            }
          };

          transaction.onabort = () => {
            console.error(
              `Transaction aborted for ${dbName}:`,
              transaction.error,
            );
            if (!completed) {
              completed = true;
              clearTimeout(timeout);
              db.close();
              resolve(false);
            } else {
              db.close();
            }
          };

          for (const [storeName, storeData] of Object.entries(dbData)) {
            try {
              const store = transaction.objectStore(storeName);

              store.clear();

              if (Array.isArray(storeData) && storeData.length > 0) {
                for (let i = 0; i < storeData.length; i++) {
                  const item = storeData[i];
                  try {
                    if (
                      item &&
                      typeof item === "object" &&
                      "key" in item &&
                      "value" in item
                    ) {
                      const putRequest = store.put(item.value, item.key);
                      putRequest.onerror = () => {
                        console.warn(
                          `Failed to put key-value ${item.key} to ${storeName}:`,
                          putRequest.error,
                        );
                      };
                    } else {
                      const addRequest = store.add(item);
                      addRequest.onerror = () => {
                        console.warn(
                          `Failed to add item ${i} to ${storeName}:`,
                          addRequest.error,
                        );
                      };
                    }
                  } catch (error) {
                    console.warn(
                      `Exception adding item ${i} to ${storeName}:`,
                      error,
                    );
                  }
                }
              }
            } catch (storeError) {
              console.error(`Error processing store ${storeName}:`, storeError);
            }
          }
        } catch (error) {
          console.error(`Failed to process data for ${dbName}:`, error);
          if (!completed) {
            completed = true;
            clearTimeout(timeout);
            db.close();
            resolve(false);
          } else {
            db.close();
          }
        }
      };
    });
  }

  async getCurrentBrowserState(): Promise<ProfileData> {
    const [cookies, localStorage, idb] = await Promise.all([
      this.getAllCookies(),
      this.getAllLocalStorage(),
      this.getAllIDBData(),
    ]);

    const result = {
      Cookies: this.encode(cookies),
      LocalStorage: this.encode(localStorage),
      IDB: this.encode(idb),
    };

    return result;
  }

  async applyBrowserState(state: ProfileData): Promise<void> {
    await Promise.all([
      this.clearAllCookies(),
      this.clearAllLocalStorage(),
      this.clearAllIDB(),
    ]);

    const cookies = this.decode(state.Cookies) || {};
    const localStorage = this.decode(state.LocalStorage) || {};
    const idb = this.decode(state.IDB) || {};

    await Promise.all([
      this.setCookies(cookies),
      this.setLocalStorage(localStorage),
      this.setIDBData(idb),
    ]);
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
      Cookies: this.encode({}),
      LocalStorage: this.encode({}),
      IDB: this.encode({}),
    };

    await this.profileStore.setItem(userID, emptyProfile);
    return true;
  }

  async createProfileWithCurrentData(userID: string): Promise<boolean> {
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

    const currentState = await this.getCurrentBrowserState();
    await this.profileStore.setItem(userID, currentState);

    this.currentProfile = userID;

    return true;
  }

  async deleteProfile(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const profile = await this.profileStore.getItem(userID);
    if (!profile) {
      throw new Error(`Profile ${userID} does not exist`);
    }
    if (this.currentProfile === userID) {
      throw new Error(
        "Cannot delete currently active profile. Switch to another profile first.",
      );
    }

    await this.profileStore.removeItem(userID);
    return true;
  }

  async switchProfile(
    userID: string,
    skipCurrentSave: boolean = false,
  ): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }
    const targetProfile = await this.profileStore.getItem<ProfileData>(userID);
    if (!targetProfile) {
      throw new Error(`Profile ${userID} does not exist`);
    }

    if (this.currentProfile && !skipCurrentSave) {
      console.log(
        `🔄 ProfilesAPI: Saving current profile "${this.currentProfile}" before switching`,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await this.saveProfile(this.currentProfile);
      console.log(
        `✅ ProfilesAPI: Successfully saved profile "${this.currentProfile}"`,
      );
    }

    console.log(
      `🔄 ProfilesAPI: Applying browser state for profile "${userID}"`,
    );
    await this.applyBrowserState(targetProfile);

    this.currentProfile = userID;
    console.log(`✅ ProfilesAPI: Successfully switched to profile "${userID}"`);

    return true;
  }

  async saveProfile(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }
    const existingProfile = await this.profileStore.getItem(userID);
    if (!existingProfile) {
      throw new Error(`Profile ${userID} does not exist`);
    }

    console.log(
      `💾 ProfilesAPI: Getting current browser state for profile "${userID}"`,
    );
    const currentState = await this.getCurrentBrowserState();

    const localStorageData = JSON.parse(currentState.LocalStorage || "{}");
    console.log(
      `💾 ProfilesAPI: LocalStorage data being saved:`,
      localStorageData,
    );

    console.log(
      `💾 ProfilesAPI: Saving browser state for profile "${userID}"`,
      {
        cookiesCount: Object.keys(JSON.parse(currentState.Cookies || "{}"))
          .length,
        localStorageCount: Object.keys(localStorageData).length,
        idbCount: Object.keys(JSON.parse(currentState.IDB || "{}")).length,
      },
    );

    await this.profileStore.setItem(userID, currentState);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const verifyData = await this.profileStore.getItem<ProfileData>(userID);
    if (verifyData) {
      const verifyLocalStorage = JSON.parse(verifyData.LocalStorage || "{}");
      console.log(`✅ ProfilesAPI: Verified saved data for "${userID}"`, {
        cookiesCount: Object.keys(JSON.parse(verifyData.Cookies || "{}"))
          .length,
        localStorageCount: Object.keys(verifyLocalStorage).length,
        idbCount: Object.keys(JSON.parse(verifyData.IDB || "{}")).length,
      });

      if (
        Object.keys(verifyLocalStorage).length !==
        Object.keys(localStorageData).length
      ) {
        console.error(
          `❌ Data mismatch! Expected ${Object.keys(localStorageData).length} localStorage keys, got ${Object.keys(verifyLocalStorage).length}`,
        );

        console.log(
          `🔄 Retrying save for profile "${userID}" due to data mismatch`,
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        await this.profileStore.setItem(userID, currentState);
        await new Promise((resolve) => setTimeout(resolve, 300));
        console.log(`✅ Retry save completed for profile "${userID}"`);
      }
    } else {
      console.error(
        `❌ Failed to verify save - could not read back profile "${userID}"`,
      );

      console.log(
        `🔄 Retrying save for profile "${userID}" due to verification failure`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.profileStore.setItem(userID, currentState);
      await new Promise((resolve) => setTimeout(resolve, 300));
      console.log(`✅ Retry save completed for profile "${userID}"`);
    }

    console.log(
      `✅ ProfilesAPI: Successfully saved profile "${userID}" to storage`,
    );

    return true;
  }

  emergencySaveProfile(userID: string): boolean {
    try {
      console.log(`🚨 Emergency save for profile "${userID}"`);

      const cookies: Record<string, string> = {};
      const localStorage: Record<string, string> = {};

      try {
        Object.keys(window.localStorage).forEach((key) => {
          const value = window.localStorage.getItem(key);
          if (value !== null) {
            localStorage[key] = value;
          }
        });
      } catch (e) {
        console.error("Error collecting localStorage in emergency save:", e);
      }

      try {
        if (document.cookie) {
          document.cookie.split(";").forEach((cookie) => {
            const [name, value] = cookie.trim().split("=");
            if (name && value) {
              cookies[name] = decodeURIComponent(value);
            }
          });
        }
      } catch (e) {
        console.error("Error collecting cookies in emergency save:", e);
      }

      const emergencyData = {
        Cookies: this.encode(cookies),
        LocalStorage: this.encode(localStorage),
        IDB: "{}",
        timestamp: Date.now(),
      };

      const backupKey = `__emergency_profile_backup_${userID}__`;
      window.localStorage.setItem(backupKey, JSON.stringify(emergencyData));

      console.log(`✅ Emergency save completed for profile "${userID}"`, {
        cookiesCount: Object.keys(cookies).length,
        localStorageCount: Object.keys(localStorage).length,
        backupKey: backupKey,
      });

      return true;
    } catch (error) {
      console.error(`❌ Emergency save failed for profile "${userID}":`, error);
      return false;
    }
  }

  async flushStorageOperations(): Promise<void> {
    try {
      const testKey = "__storage_flush_test__";
      const testValue = { timestamp: Date.now(), test: "data" };

      await this.profileStore.setItem(testKey, testValue);
      const readBack = (await this.profileStore.getItem(testKey)) as any;

      if (readBack && readBack.timestamp === testValue.timestamp) {
        await this.profileStore.removeItem(testKey);
        console.log("✅ Storage flush test passed");
      } else {
        console.warn(
          "⚠️ Storage flush test failed - storage operations may be delayed",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.warn("⚠️ Storage flush test error:", error);
    }
  }

  async listProfiles(): Promise<string[]> {
    return await this.profileStore.keys();
  }

  async clearCurrentProfileData(): Promise<boolean> {
    await Promise.all([
      this.clearAllCookies(),
      this.clearAllLocalStorage(),
      this.clearAllIDB(),
    ]);

    return true;
  }

  getCurrentProfile(): string | null {
    return this.currentProfile;
  }

  async getProfileData(
    userID: string,
  ): Promise<{ cookies: any; localStorage: any; idb: any } | null> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }

    const profile = await this.profileStore.getItem<ProfileData>(userID);
    if (!profile) {
      return null;
    }

    return {
      cookies: this.decode(profile.Cookies),
      localStorage: this.decode(profile.LocalStorage),
      idb: this.decode(profile.IDB),
    };
  }

  async profileExists(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      return false;
    }

    const profile = await this.profileStore.getItem(userID);
    return profile !== null;
  }

  async exportIndexedDBs(): Promise<DatabaseExport[]> {
    try {
      const databases = await indexedDB.databases();

      const systemDatabases = ["Profiles", "ProfileIDB"];

      const userDatabases = databases.filter((db) => {
        const dbName = db.name || "";
        return !systemDatabases.includes(dbName);
      });

      const exports: DatabaseExport[] = [];

      for (const dbInfo of userDatabases) {
        try {
          const dbExport = await this.exportSingleDatabase(dbInfo.name || "");
          if (dbExport) {
            exports.push(dbExport);
          }
        } catch (error) {
          console.warn(`Failed to export database ${dbInfo.name}:`, error);
        }
      }

      return exports;
    } catch (error) {
      console.error("Failed to export IndexedDB databases:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error("Failed to export IndexedDB databases: " + errorMessage);
    }
  }

  async exportSingleDatabase(dbName: string): Promise<DatabaseExport | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);

      request.onerror = () => {
        reject(new Error(`Failed to open database ${dbName}`));
      };

      request.onsuccess = async (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          const storeNames = Array.from(db.objectStoreNames);
          const storeData: Record<string, any[]> = {};

          for (const storeName of storeNames) {
            try {
              const data = await this.exportObjectStore(db, storeName);
              storeData[storeName] = data;
            } catch (error) {
              console.warn(
                `Failed to export store ${storeName} from ${dbName}:`,
                error,
              );
              storeData[storeName] = [];
            }
          }

          db.close();

          resolve({
            name: dbName,
            data: storeData,
          });
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  async exportObjectStore(db: IDBDatabase, storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);

      const data: any[] = [];
      const request = store.openCursor();

      request.onerror = () => {
        reject(new Error(`Failed to read from store ${storeName}`));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          data.push({
            key: cursor.key,
            value: cursor.value,
          });
          cursor.continue();
        } else {
          resolve(data);
        }
      };
    });
  }

  async exportCurrentProfile(): Promise<ProfileExport> {
    const [idbExports, localStorage, cookies] = await Promise.all([
      this.exportIndexedDBs(),
      this.getAllLocalStorage(),
      this.getAllCookies(),
    ]);

    return {
      profileId: this.currentProfile,
      timestamp: new Date().toISOString(),
      indexedDB: idbExports,
      localStorage: localStorage,
      cookies: cookies,
    };
  }

  async downloadExport(filename: string | null = null): Promise<boolean> {
    try {
      const exportData = await this.exportCurrentProfile();

      let finalFilename: string;
      if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const profileName = this.currentProfile || "unknown";
        finalFilename = `profile-export-${profileName}-${timestamp}.json`;
      } else {
        finalFilename = filename;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error("Failed to download export:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error("Failed to download export: " + errorMessage);
    }
  }
}

export { ProfilesAPI };
