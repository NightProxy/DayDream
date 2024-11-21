class ProfilesAPI {
  constructor() {
    this.PROFILE_DB_NAME = "profilesDB";
    this.PROFILE_STORE_NAME = "profiles";
    this.cookies = Cookies;
    this.encryption = new Profiles_DataEncryption();
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
    await this._waitForRequest(request);
    db.close();
  }

  async createProfile(profileName, autoSelect = false) {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const profile = {
      name: profileName,
      data: "",
      date: new Date().toISOString(),
    };

    const request = store.put(profile, profileName);
    await this._waitForRequest(request);

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

    const request = store.get(profileName);
    const profile = await this._waitForRequest(request);

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
    const request = store.put(profileName, "activeProfile");
    await this._waitForRequest(request);
    db.close();

    await this.clearAllData();
    await this.importData(profile.data);
  }

  async getActiveProfile() {
    const db = await this.openDB(this.PROFILE_DB_NAME, this.PROFILE_STORE_NAME);
    const tx = db.transaction(this.PROFILE_STORE_NAME, "readonly");
    const store = tx.objectStore(this.PROFILE_STORE_NAME);

    const request = store.get("activeProfile");
    const activeProfileName = await this._waitForRequest(request);

    db.close();
    return activeProfileName ? await this.getProfile(activeProfileName) : null;
  }

  async saveCurrentProfileData() {
    let activeProfile = await this.getActiveProfile();
    console.log(activeProfile);
    if (activeProfile) {
      const data = await this.exportData();
      activeProfile.data = data;
      console.log(activeProfile);

      const db = await this.openDB(
        this.PROFILE_DB_NAME,
        this.PROFILE_STORE_NAME,
      );
      const tx = db.transaction(this.PROFILE_STORE_NAME, "readwrite");
      const store = tx.objectStore(this.PROFILE_STORE_NAME);
      const request = store.put(activeProfile, activeProfile.name);
      await this._waitForRequest(request);
      db.close();
    }
  }

  async clearAllData() {
    localStorage.clear();
    const dbNames = await indexedDB.databases();
    for (const { name } of dbNames) {
      if (name !== this.PROFILE_DB_NAME) {
        await indexedDB.deleteDatabase(name);
      }
    }
    this.clearCookies();
  }

  clearCookies() {
    const allCookies = this.cookies.get();
    Object.keys(allCookies).forEach((cookieName) => {
      this.cookies.remove(cookieName, { path: "/" });
    });
    console.log("All cookies have been cleared!");
  }

  extractCookies() {
    let cookies = {};
    document.cookie.split(";").forEach((c) => {
      let parts = c.split("=");
      cookies[parts.shift().trim()] = decodeURI(parts.join("="));
    });
    return cookies;
  }

  async getIDBData(databaseName) {
    return new Promise((resolve, reject) => {
      let dbRequest = indexedDB.open(databaseName);

      dbRequest.onsuccess = (event) => {
        let db = event.target.result;
        let transaction = db.transaction(db.objectStoreNames, "readonly");
        let data = {};

        transaction.oncomplete = () => resolve({ name: databaseName, data });
        transaction.onerror = (event) => reject(event.target.error);

        for (let storeName of db.objectStoreNames) {
          let objectStore = transaction.objectStore(storeName);
          let request = objectStore.openCursor();
          data[storeName] = [];

          request.onsuccess = (event) => {
            let cursor = event.target.result;
            if (cursor) {
              data[storeName].push({
                key: cursor.primaryKey,
                value: cursor.value,
              });
              cursor.continue();
            }
          };

          request.onerror = (event) => reject(event.target.error);
        }
      };

      dbRequest.onerror = (event) => reject(event.target.error);
    });
  }

  async getAllIDBData() {
    const databases = await indexedDB.databases();
    let promises = databases
      .filter((dbInfo) => dbInfo.name !== this.PROFILE_DB_NAME)
      .map((dbInfo) => this.getIDBData(dbInfo.name));

    return Promise.all(promises);
  }

  async exportData() {
    const idbData = await this.getAllIDBData();
    let data = {
      idbData: JSON.stringify(idbData),
      localStorageData: JSON.stringify(localStorage),
      cookies: this.extractCookies(),
    };

    let jsonData = JSON.stringify(data);
    let encryptedData = this.encryption.base6xorEncrypt(jsonData);
    return encryptedData;
  }

  async importData(input) {
    try {
      let decryptedDataJSON = this.encryption.base6xorDecrypt(input);
      let decryptedData = JSON.parse(decryptedDataJSON);

      let idbData = JSON.parse(decryptedData.idbData);
      let idbPromises = idbData.map((dbInfo) => {
        return this._importIDBData(dbInfo);
      });

      await Promise.all(idbPromises);

      localStorage.clear();
      Object.keys(decryptedData.localStorageData).forEach((key) => {
        localStorage.setItem(key, decryptedData.localStorageData[key]);
      });

      this.clearCookies();
      Object.entries(decryptedData.cookies).forEach(
        ([cookieName, cookieValue]) => {
          this.cookies.set(cookieName, cookieValue);
        },
      );
    } catch (err) {
      console.error("Error importing data:", err);
    }
  }

  async _importIDBData(dbInfo) {
    return new Promise((resolve, reject) => {
      let dbRequest = indexedDB.open(dbInfo.name);

      dbRequest.onsuccess = (event) => {
        let db = event.target.result;
        let transaction = db.transaction(db.objectStoreNames, "readwrite");

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);

        for (let storeName of db.objectStoreNames) {
          let objectStore = transaction.objectStore(storeName);
          let storeData = dbInfo.data[storeName];

          objectStore.clear().onsuccess = () => {
            storeData.forEach((item) => {
              if (item.key) {
                objectStore.put(item.value, item.key);
              } else {
                objectStore.add(item.value);
              }
            });
          };
        }
      };

      dbRequest.onerror = (event) => reject(event.target.error);
    });
  }

  async _waitForRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

class Profiles_DataEncryption {
  constructor() {}

  base6xorEncrypt(text) {
    let output = "";
    for (let i = 0; i < text.length; i++) {
      let charCode = text.charCodeAt(i) ^ 2;
      output += String.fromCharCode(charCode);
    }
    return btoa(encodeURIComponent(output));
  }

  base6xorDecrypt(encryptedData) {
    let decodedData = decodeURIComponent(atob(encryptedData));
    let output = "";
    for (let i = 0; i < decodedData.length; i++) {
      let charCode = decodedData.charCodeAt(i) ^ 2;
      output += String.fromCharCode(charCode);
    }
    return output;
  }
}
