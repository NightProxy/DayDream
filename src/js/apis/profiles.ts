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

    if (cookieString) {
      cookieString.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name) {
          cookies[name] = rest.join("=");
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
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data[key] = value;
        }
      }
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
      const userDatabases = databases.filter((db) => db.name !== "Profiles");

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
        if (typeof dbData === "object" && dbData !== null) {
          await this.restoreDatabase(dbName, dbData);
        } else {
          await this.idbStore.setItem(dbName, dbData);
        }
      }
    } catch (error) {
      console.error("Failed to set IndexedDB data:", error);
      for (const [key, value] of Object.entries(data)) {
        await this.idbStore.setItem(key, value);
      }
    }
  }

  async clearAllIDB(): Promise<void> {
    try {
      const databases = await indexedDB.databases();
      const userDatabases = databases.filter((db) => db.name !== "Profiles");

      for (const dbInfo of userDatabases) {
        try {
          if (dbInfo.name) {
            await new Promise<boolean>((resolve, reject) => {
              const deleteRequest = indexedDB.deleteDatabase(dbInfo.name!);
              deleteRequest.onsuccess = () => {
                console.log(`Deleted database: ${dbInfo.name}`);
                resolve(true);
              };
              deleteRequest.onerror = () => {
                console.warn(`Failed to delete database: ${dbInfo.name}`);
                reject(deleteRequest.error);
              };
              deleteRequest.onblocked = () => {
                console.warn(`Delete blocked for database: ${dbInfo.name}`);
                resolve(true);
              };
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
    return new Promise((resolve, reject) => {
      const version = 1;
      const request = indexedDB.open(dbName, version);

      request.onerror = () => {
        console.error(`Failed to restore database ${dbName}:`, request.error);
        reject(request.error);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        for (const storeName of Object.keys(dbData)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const storeData = dbData[storeName];
            const hasId = storeData.some(
              (item: any) => item && typeof item === "object" && "id" in item,
            );

            if (hasId) {
              db.createObjectStore(storeName, {
                keyPath: "id",
                autoIncrement: true,
              });
            } else {
              db.createObjectStore(storeName, { autoIncrement: true });
            }
          }
        }
      };

      request.onsuccess = async (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          const transaction = db.transaction(Object.keys(dbData), "readwrite");

          for (const [storeName, storeData] of Object.entries(dbData)) {
            const store = transaction.objectStore(storeName);

            if (Array.isArray(storeData)) {
              for (const item of storeData) {
                store.add(item);
              }
            }
          }

          transaction.oncomplete = () => {
            console.log(`Successfully restored database: ${dbName}`);
            db.close();
            resolve(true);
          };

          transaction.onerror = () => {
            console.error(
              `Transaction failed for database ${dbName}:`,
              transaction.error,
            );
            db.close();
            reject(transaction.error);
          };
        } catch (error) {
          console.error(
            `Failed to restore data for database ${dbName}:`,
            error,
          );
          db.close();
          reject(error);
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

    return {
      Cookies: this.encode(cookies),
      LocalStorage: this.encode(localStorage),
      IDB: this.encode(idb),
    };
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

  async switchProfile(userID: string): Promise<boolean> {
    if (!userID || typeof userID !== "string") {
      throw new Error("Invalid userID: must be a non-empty string");
    }
    const targetProfile = await this.profileStore.getItem<ProfileData>(userID);
    if (!targetProfile) {
      throw new Error(`Profile ${userID} does not exist`);
    }
    if (this.currentProfile) {
      await this.saveProfile(this.currentProfile);
    }
    await this.applyBrowserState(targetProfile);

    this.currentProfile = userID;

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
    const currentState = await this.getCurrentBrowserState();
    await this.profileStore.setItem(userID, currentState);

    return true;
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

      const userDatabases = databases.filter((db) => db.name !== "Profiles");

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
      const request = store.getAll();

      request.onerror = () => {
        reject(new Error(`Failed to read from store ${storeName}`));
      };

      request.onsuccess = () => {
        resolve(request.result || []);
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
