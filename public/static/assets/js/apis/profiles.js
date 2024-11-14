class ProfilesAPI {
  constructor() {
    this.PROFILE_DB_NAME = "profilesDB";
    this.PROFILE_STORE_NAME = "profiles";
    this.cookies = Cookies;
  }

  async openDB(dbName, storeNames) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.PROFILE_STORE_NAME)) {
          db.createObjectStore(this.PROFILE_STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async init() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const request = store.get("activeProfile");

    request.onsuccess = () => {
      if (!request.result) {
        store.put("", "activeProfile");
      }
    };
    db.close();
  }

  async getAllProfiles() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const allProfiles = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return allProfiles;
  }

  async createProfile(profileName, autoSelect = false) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const profile = {
      name: profileName,
      IDB: {}, // Store all IDB data here under this property
      cookies: "",
      LS: "",
      date: new Date().toISOString(),
    };

    await new Promise((resolve, reject) => {
      const request = store.put(profile, profileName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    if (autoSelect) {
      await this.setActiveProfile(profileName);
    }

    db.close();
    return profile;
  }

  async getProfile(profileName) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const profile = await new Promise((resolve, reject) => {
      const request = store.get(profileName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return profile || null;
  }

  async setActiveProfile(profileName) {
    const profile = await this.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile "${profileName}" does not exist.`);
    }

    await this.saveCurrentProfileData();

    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = store.put(profileName, "activeProfile");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();

    await this.clearAllData();
    await this._rewriteData(profile);
  }

  async getActiveProfile() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const activeProfileName = await new Promise((resolve, reject) => {
      const request = store.get("activeProfile");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return activeProfileName ? await this.getProfile(activeProfileName) : null;
  }

  async saveCurrentProfileData() {
    const activeProfile = await this.getActiveProfile();
    if (activeProfile) {
      activeProfile.LS = btoa(JSON.stringify(localStorage));
      activeProfile.IDB = {}; // Store all IDB data under this property

      const dbNames = await indexedDB.databases();
      for (const { name } of dbNames) {
        // Skip the profile database itself
        if (name !== this.PROFILE_DB_NAME) {
          activeProfile.IDB[name] = await this._saveIDBData(name);
        }
      }
      activeProfile.cookies = btoa(JSON.stringify(this.cookies.get()));
      const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
      const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
      const store = tx.objectStore(this.PROFILE_STORE_NAME);
      await store.put(activeProfile, activeProfile.name);
      db.close();
    }
  }

  async _saveIDBData(dbName) {
    const data = {};

    // Open the IndexedDB database
    const db = await this.openDB(dbName, dbName);
    const tx = db.transaction(dbName, "readonly");

    const objectStoreNames = db.objectStoreNames;
    for (const storeName of objectStoreNames) {
      const store = tx.objectStore(storeName);

      // Retrieve all keys in the store
      const allKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Retrieve all values for each key
      for (const key of allKeys) {
        data[key] = await new Promise((resolve, reject) => {
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
    }

    db.close(); // Close the database
    return data; // Return the data object
  }

  async clearAllData() {
    localStorage.clear();
    const dbNames = await indexedDB.databases();
    for (const { name } of dbNames) {
      if (name !== this.PROFILE_DB_NAME) {
        await indexedDB.deleteDatabase(name);
      }
    }
    this.cookies.clear();
  }

  async _rewriteData(profile) {
    const lsData = JSON.parse(atob(profile.LS));
    Object.keys(lsData).forEach((key) => {
      localStorage.setItem(key, lsData[key]);
    });

    for (const [dbName, dbData] of Object.entries(profile.IDB)) {
      await this._restoreIDBData(dbName, dbData);
    }

    const cookiesData = JSON.parse(atob(profile.cookies));
    Object.keys(cookiesData).forEach((key) => {
      this.cookies.set(key, cookiesData[key]);
    });
  }

  async _restoreIDBData(dbName, dbData) {
    const db = await this.openDB(dbName, "dataStore");
    const tx = db.transaction("dataStore", "readwrite");
    const store = tx.objectStore("dataStore");

    for (const [key, value] of Object.entries(dbData)) {
      await store.put(value, key);
    }
    db.close();
  }
}


/*class ProfilesAPI {
  constructor() {
    this.PROFILE_DB_NAME = "profilesDB";
    this.PROFILE_STORE_NAME = "profiles";
    this.cookies = Cookies;
  }

  async openDB(dbName, storeNames) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.PROFILE_STORE_NAME)) {
          db.createObjectStore(this.PROFILE_STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async init() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const request = store.get("activeProfile");

    request.onsuccess = () => {
      if (!request.result) {
        store.put("", "activeProfile");
      }
    };
    db.close();
  }

  async getAllProfiles() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const allProfiles = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return allProfiles;
  }

  async createProfile(profileName, autoSelect = false) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const profile = {
      name: profileName,
      IDB: {}, // Store all IDB data here under this property
      cookies: "",
      LS: "",
      date: new Date().toISOString(),
    };

    await new Promise((resolve, reject) => {
      const request = store.put(profile, profileName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    if (autoSelect) {
      await this.setActiveProfile(profileName);
    }

    db.close();
    return profile;
  }

  async getProfile(profileName) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const profile = await new Promise((resolve, reject) => {
      const request = store.get(profileName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return profile || null;
  }

  async setActiveProfile(profileName) {
    const profile = await this.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile "${profileName}" does not exist.`);
    }

    await this.saveCurrentProfileData();

    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = store.put(profileName, "activeProfile");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();

    await this.clearAllData();
    await this._rewriteData(profile);
  }

  async getActiveProfile() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const activeProfileName = await new Promise((resolve, reject) => {
      const request = store.get("activeProfile");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return activeProfileName ? await this.getProfile(activeProfileName) : null;
  }

  async saveCurrentProfileData() {
    const activeProfile = await this.getActiveProfile();
    if (activeProfile) {
      activeProfile.LS = btoa(JSON.stringify(localStorage));
      activeProfile.IDB = {}; // Store all IDB data under this property

      const dbNames = await indexedDB.databases();
      for (const { name } of dbNames) {
        if (name !== this.PROFILE_DB_NAME) {
          activeProfile.IDB[name] = await this._saveIDBData(name);
        }
      }
      activeProfile.cookies = btoa(JSON.stringify(this.cookies.get()));
      const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
      const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
      const store = tx.objectStore(this.PROFILE_STORE_NAME);
      await store.put(activeProfile, activeProfile.name);
      db.close();
    }
  }

  async _saveIDBData(dbName) {
    const data = {};
    const db = await this.openDB(dbName, "dataStore");
    const tx = db.transaction("dataStore", "readonly");
    const store = tx.objectStore("dataStore");

    const allKeys = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    for (const key of allKeys) {
      data[key] = await new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
    return data;
  }

  async clearAllData() {
    localStorage.clear();
    const dbNames = await indexedDB.databases();
    for (const { name } of dbNames) {
      if (name !== this.PROFILE_DB_NAME) {
        await indexedDB.deleteDatabase(name);
      }
    }
    this.cookies.clear();
  }

  async _rewriteData(profile) {
    const lsData = JSON.parse(atob(profile.LS));
    Object.keys(lsData).forEach((key) => {
      localStorage.setItem(key, lsData[key]);
    });

    for (const [dbName, dbData] of Object.entries(profile.IDB)) {
      await this._restoreIDBData(dbName, dbData);
    }

    const cookiesData = JSON.parse(atob(profile.cookies));
    Object.keys(cookiesData).forEach((key) => {
      this.cookies.set(key, cookiesData[key]);
    });
  }

  async _restoreIDBData(dbName, dbData) {
    const db = await this.openDB(dbName, "dataStore");
    const tx = db.transaction("dataStore", "readwrite");
    const store = tx.objectStore("dataStore");

    for (const [key, value] of Object.entries(dbData)) {
      await store.put(value, key);
    }
    db.close();
  }
}*/
