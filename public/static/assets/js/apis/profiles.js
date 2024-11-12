class ProfilesAPI {
  constructor() {
    this.PROFILE_DB_NAME = "profileDB";
    this.PROFILE_STORE_NAME = "profiles";
    this.DATA_STORE_NAME = "data";
    this.Cookies = Cookies;
  }

  async openDB(dbName, storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async createProfile(profileName) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const profile = {
      name: profileName,
      databases: {},
      cookies: "",
      LS: "",
      date: new Date().toISOString(),
    };
    await store.put(profile, profileName);
    db.close();
    return profile;
  }

  async getProfile(profileName) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const profile = await store.get(profileName);
    db.close();
    return profile;
  }

  async saveCurrentProfileData() {
    const activeProfile = await this.getActiveProfile();
    if (activeProfile) {
      activeProfile.LS = btoa(JSON.stringify(localStorage));
      activeProfile.databases = {};
      const dbNames = await indexedDB.databases();
      for (const { name } of dbNames) {
        if (name !== this.PROFILE_DB_NAME) {
          activeProfile.databases[name] = await this._captureDBData(name);
        }
      }
      activeProfile.cookies = btoa(JSON.stringify(this.Cookies.get()));
      const profileDB = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
      const profileTx = profileDB.transaction(this.PROFILE_STORE_NAME, "readwrite");
      const profileStore = profileTx.objectStore(this.PROFILE_STORE_NAME);
      await profileStore.put(activeProfile, activeProfile.name);
      profileDB.close();
    }
  }

  async _captureDBData(dbName) {
    const db = await this.openDB(dbName, this.DATA_STORE_NAME);
    const tx = db.transaction(this.DATA_STORE_NAME, "readonly");
    const store = tx.objectStore(this.DATA_STORE_NAME);
    const data = {};
    await new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          data[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return data;
  }

  async clearAllData() {
    localStorage.clear();
    const dbNames = await indexedDB.databases();
    for (const { name } of dbNames) {
      if (name !== this.PROFILE_DB_NAME) {
        const db = await this.openDB(name, this.DATA_STORE_NAME);
        const tx = db.transaction(this.DATA_STORE_NAME, "readwrite");
        tx.objectStore(this.DATA_STORE_NAME).clear();
        await tx.done;
        db.close();
      }
    }
    this.Cookies.remove();
  }

  async _rewriteData(profile) {
    const lsData = JSON.parse(atob(profile.LS));
    Object.keys(lsData).forEach((key) => {
      localStorage.setItem(key, lsData[key]);
    });
    for (const [dbName, data] of Object.entries(profile.databases)) {
      const db = await this.openDB(dbName, this.DATA_STORE_NAME);
      const tx = db.transaction(this.DATA_STORE_NAME, "readwrite");
      const store = tx.objectStore(this.DATA_STORE_NAME);
      for (const [key, value] of Object.entries(data)) {
        store.put(value, key);
      }
      await tx.done;
      db.close();
    }
    const cookiesData = JSON.parse(atob(profile.cookies));
    Object.keys(cookiesData).forEach((key) => {
      this.Cookies.set(key, cookiesData[key]);
    });
  }

  async getActiveProfile() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);
    const activeProfileName = await store.get("activeProfile");
    db.close();
    return this.getProfile(activeProfileName);
  }

  async setActiveProfile(profileName) {
    await this.saveCurrentProfileData();
    const newProfile = await this.getProfile(profileName);
    await this.clearAllData();
    await this._rewriteData(newProfile);
  }
}
