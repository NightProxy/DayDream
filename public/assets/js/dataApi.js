class DataAPI {
    constructor() {
        this.profiles = new ProfilesAPI();
        this.verisons = new VersionsAPI();
        this.extensions = new ExtensionsAPI();
        this.logger = new Logger();
        this.dataexport = new DataExportAPI();
    }
}

class ProfilesAPI {
    constructor() {
        this.PROFILE_STORE_NAME = 'profiles';
        this.DATA_STORE_NAME = 'data';
        this.localForage = localforage;
        this.Cookies = Cookies;
    }

    async createProfile(profileName) {
        const profile = {
            name: profileName,
            cookies: '',
            LS: '',
            IDB: '',
            date: new Date().toISOString(),
        };
        await this.localForage.setItem(`${this.PROFILE_STORE_NAME}:${profileName}`, profile);
        return profile;
    }

    async getProfile(profileName) {
        return await this.localForage.getItem(`${this.PROFILE_STORE_NAME}:${profileName}`);
    }

    async getAllProfiles() {
        const profiles = await this.localForage.keys(`${this.PROFILE_STORE_NAME}:*`);
        return Promise.all(profiles.map((profileName) => this.getProfile(profileName)));
    }

    async setActiveProfile(profileName) {
        await this.saveCurrentProfileData();

        const newProfile = await this.getProfile(profileName);

        await this.clearAllData();

        await this._rewriteData(newProfile);
    }

    async saveCurrentProfileData() {
        const activeProfile = await this.getActiveProfile();
        if (activeProfile) {
            activeProfile.LS = btoa(JSON.stringify(localStorage));

            const idbData = {};
            await Promise.all((await this.localForage.keys(`${this.DATA_STORE_NAME}:*`)).map(async (key) => {
                idbData[key] = await this.localForage.getItem(key);
            }));
            activeProfile.IDB = btoa(JSON.stringify(idbData));

            activeProfile.cookies = btoa(JSON.stringify(this.Cookies.get()));

            await this.localForage.setItem(`${this.PROFILE_STORE_NAME}:${activeProfile.name}`, activeProfile);
        }
    }

    async clearAllData() {
        localStorage.clear();
        await this.localForage.clear(`${this.DATA_STORE_NAME}:*`);
        this.Cookies.remove();
    }

    async _rewriteData(profile) {
        const lsData = JSON.parse(atob(profile.LS));
        Object.keys(lsData).forEach((key) => {
            localStorage.setItem(key, lsData[key]);
        });

        const idbData = JSON.parse(atob(profile.IDB));
        Object.keys(idbData).forEach((key) => {
            this.localForage.setItem(key, idbData[key]);
        });

        const cookiesData = JSON.parse(atob(profile.cookies));
        Object.keys(cookiesData).forEach((key) => {
            this.Cookies.set(key, cookiesData[key]);
        });
    }

    async getActiveProfile() {
        const activeProfileName = await this.localForage.getItem('activeProfile');
        return this.getProfile(activeProfileName);
    }
}

class VersionsAPI {
    constructor() {
    }

    async fetchLastCommitDate(tag) {
        try {
            const response = await fetch(
                'https://api.github.com/repos/NightProxy/DayDreamX/commits'
            );
            const commits = await response.json();
            const lastCommitDate = new Date(commits[0].commit.committer.date);
            const formattedDate = lastCommitDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            tag.textContent = formattedDate;
        } catch (error) {
            console.error('Error fetching the last commit date:', error);
        }
    }

    async fetchLatestVersionNumber(tag) {
        try {
            const response = await fetch(
                'https://api.github.com/repos/NightProxy/DayDreamX/releases/latest'
            );
            const release = await response.json();
            tag.textContent = release.tag_name;
        } catch (error) {
            console.error('Error fetching the latest version number:', error);
        }
    }
}

// ExtensionsAPI.js
class ExtensionsAPI {
    constructor() {
        // Initialize the database to store extensions and their metadata
        this.db = localforage.createInstance({
            name: 'extensions',
            storeName: 'extensions',
        });

        // Extensions object and list tracking
        this.extensions = {};
        this.extensionLists = {
            enabled: [],
            disabled: [],
            installed: [],
        };
    }

    // Load extensions data from localforage
    async loadExtensions() {
        const storedExtensions = await this.db.getItem('extensions');
        const extensionLists = await this.db.getItem('extensionLists');

        this.extensions = storedExtensions || {};
        this.extensionLists = extensionLists || {
            enabled: [],
            disabled: [],
            installed: [],
        };
    }

    // Save the current state of extensions and lists
    async saveExtensions() {
        await this.db.setItem('extensions', this.extensions);
        await this.db.setItem('extensionLists', this.extensionLists);
    }

    // Register and install a new extension
    async installExtension(file) {
        try {
            // Use JSZip to extract the .ddxpkg file
            const zip = await JSZip.loadAsync(file);
            const manifestContent = await zip.file('manifest.json').async('string');
            const manifest = JSON.parse(manifestContent);
            const extensionID = manifest.id;

            // Check if extension is already installed
            if (this.extensions[extensionID]) {
                console.log(`Extension ${extensionID} is already installed.`);
                return;
            }

            // Register extension metadata
            this.extensions[extensionID] = {
                id: extensionID,
                name: manifest.name,
                enabled: false,
                manifest: manifest,
            };
            this.extensionLists.installed.push(extensionID);

            // Send the file to Service Worker to handle unzipping and storage
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'installExtension',
                    file: file,
                });
                console.log(`Sent ${manifest.name} to Service Worker for installation.`);
            } else {
                console.error('Service Worker not available.');
            }

            // Save the updated extension state
            await this.saveExtensions();
            console.log(`Extension ${manifest.name} installed successfully.`);
        } catch (error) {
            console.error('Failed to install extension:', error);
        }
    }

    // Enable an extension by ID
    async enable(extensionID) {
        await this.toggleExtension(extensionID, true);
    }

    // Disable an extension by ID
    async disable(extensionID) {
        await this.toggleExtension(extensionID, false);
    }

    // Toggle extension enabled/disabled state
    async toggleExtension(extensionID, enabled) {
        if (this.extensions[extensionID]) {
            this.extensions[extensionID].enabled = enabled;

            if (enabled) {
                this.extensionLists.enabled.push(extensionID);
                this.extensionLists.disabled = this.extensionLists.disabled.filter(
                    (id) => id !== extensionID
                );
            } else {
                this.extensionLists.disabled.push(extensionID);
                this.extensionLists.enabled = this.extensionLists.enabled.filter(
                    (id) => id !== extensionID
                );
            }

            await this.saveExtensions();
            console.log(`Extension ${extensionID} ${enabled ? 'enabled' : 'disabled'}.`);
        } else {
            console.log(`Extension ${extensionID} not found.`);
        }
    }

    // Remove an extension by ID
    async remove(extensionID) {
        if (this.extensions[extensionID]) {
            delete this.extensions[extensionID];
            this.extensionLists.installed = this.extensionLists.installed.filter(
                (id) => id !== extensionID
            );
            this.extensionLists.enabled = this.extensionLists.enabled.filter(
                (id) => id !== extensionID
            );
            this.extensionLists.disabled = this.extensionLists.disabled.filter(
                (id) => id !== extensionID
            );

            await this.saveExtensions();
            console.log(`Extension ${extensionID} removed.`);
        } else {
            console.log(`Extension ${extensionID} not found.`);
        }
    }
}

class DataExportAPI {
    constructor() {
    }

    base6xorEncrypt(text) {
        let output = '';
        for (let i = 0; i < text.length; i++) {
            let charCode = text.charCodeAt(i) ^ 2;
            let encryptedData = String.fromCharCode(charCode);
            output += encryptedData;
        }
        return window.btoa(encodeURIComponent(output));
    }

    base6xorDecrypt(encryptedData) {
        let decodedData = decodeURIComponent(window.atob(encryptedData));
        let output = '';
        for (let i = 0; i < decodedData.length; i++) {
            let charCode = decodedData.charCodeAt(i) ^ 2;
            let decryptedOutput = String.fromCharCode(charCode);
            output += decryptedOutput;
        }
        return output;
    }

    extractCookies() {
        let cookies = {};
        document.cookie.split(';').forEach(c => {
            let parts = c.split('=');
            cookies[parts.shift().trim()] = decodeURI(parts.join('='));
        });
        return cookies;
    }

    async getIDBData(databaseName) {
        return new Promise((resolve, reject) => {
            let dbRequest = indexedDB.open(databaseName);

            dbRequest.onsuccess = event => {
                let db = event.target.result;
                let transaction = db.transaction(db.objectStoreNames, 'readonly');
                let data = {};

                transaction.oncomplete = () => {
                    resolve({ name: databaseName, data });
                };

                transaction.onerror = event => {
                    reject(event.target.error);
                };

                for (let storeName of db.objectStoreNames) {
                    let objectStore = transaction.objectStore(storeName);
                    let request = objectStore.openCursor();
                    data[storeName] = [];

                    request.onsuccess = event => {
                        let cursor = event.target.result;
                        if (cursor) {
                            data[storeName].push({
                                key: cursor.primaryKey,
                                value: cursor.value
                            });
                            cursor.continue();
                        }
                    };

                    request.onerror = event => {
                        reject(event.target.error);
                    };
                }
            };

            dbRequest.onerror = event => {
                reject(event.target.error);
            };
        });
    }

    decodeBase64(dataUrl) {
        const base64String = dataUrl.split(',')[1];
        return window.atob(base64String);
    }

    getAllIDBData() {
        return indexedDB.databases().then(databases => {
            let promises = databases.map(dbInfo => getIDBData(dbInfo.name));
            return Promise.all(promises);
        });
    }

    exportData(fileName) {
        getAllIDBData()
            .then(idbData => {
                let data = {
                    idbData: JSON.stringify(idbData),
                    localStorageData: JSON.stringify(localStorage),
                    cookies: extractCookies()
                };

                let jsonData = JSON.stringify(data);
                let encryptedData = base6xorEncrypt(jsonData);

                let blob = new Blob([encryptedData], {
                    type: 'application/octet-stream'
                });

                if (window.navigator.msSaveOrOpenBlob) {
                    window.navigator.msSaveBlob(blob, fileName);
                } else {
                    let a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }

                alert('Browsing Data has been correctly exported!');
            })
            .catch(err => {
                console.error('An error occurred during the export of data:', err);
            });
    }

    importData(input) {
        let fileInput = input;
        let file = fileInput.files[0];
        let reader = new FileReader();

        reader.onload = e => {
            try {
                let decryptedDataJSON = base6xorDecrypt(e.target.result);
                let decryptedData = JSON.parse(decryptedDataJSON);

                let idbData = JSON.parse(decryptedData.idbData);
                let idbPromises = idbData.map(dbInfo => {
                    return new Promise((resolve, reject) => {
                        let dbRequest = indexedDB.open(dbInfo.name);

                        dbRequest.onsuccess = event => {
                            let db = event.target.result;
                            let transaction = db.transaction(
                                db.objectStoreNames,
                                'readwrite'
                            );

                            transaction.oncomplete = () => {
                                resolve();
                            };

                            transaction.onerror = event => {
                                reject(event.target.error);
                            };

                            for (let storeName of db.objectStoreNames) {
                                let objectStore =
                                    transaction.objectStore(storeName);
                                let storeData = dbInfo.data[storeName];

                                objectStore.clear().onsuccess = () => {
                                    storeData.forEach(item => {
                                        if (item.key) {
                                            objectStore.put(item.value, item.key);
                                        } else {
                                            objectStore.add(item.value);
                                        }
                                    });
                                };
                            }
                        };

                        dbRequest.onerror = event => {
                            reject(event.target.error);
                        };
                    });
                });

                localStorage.clear();
                let localStorageData = JSON.parse(decryptedData.localStorageData);
                for (let key in localStorageData) {
                    localStorage.setItem(key, localStorageData[key]);
                }

                document.cookie.split(';').forEach(c => {
                    document.cookie = c
                        .replace(/^ +/, '')
                        .replace(
                            /=.*/,
                            '=;expires=' + new Date().toUTCString() + ';path=/'
                        );
                });

                let cookieData = decryptedData.cookies;
                for (let key in cookieData) {
                    document.cookie = key + '=' + cookieData[key] + ';path=/';
                }

                Promise.all(idbPromises)
                    .then(() => {
                        alert('Browsing Data has been correctly imported!');
                        window.location.reload();
                    })
                    .catch(err => {
                        console.error(
                            'An error occurred during the import of data:',
                            err
                        );
                    });
            } catch (error) {
                console.error('Error during import:', error);
                alert(
                    'An error occurred during the import of data. Please ensure the file is correct and try again.'
                );
            }
        };

        reader.readAsText(file);
    }
}

class Logger {
    constructor() {
      this.store = localforage.createInstance({
        name: "logs",
      });
      this.sessionId = this.getSessionId();
    }
  
    getSessionId() {
      const storedSessionId = sessionStorage.getItem("sessionId");
      if (storedSessionId) {
        return storedSessionId;
      } else {
        const newSessionId = this.generateSessionId();
        sessionStorage.setItem("sessionId", newSessionId);
        return newSessionId;
      }
    }
  
    generateSessionId() {
      const date = new Date();
      return `log-${date.toISOString()}`;
    }
  
    async createLog(message) {
      const log = await this.getLog(this.sessionId);
      if (log) {
        log.push({ timestamp: new Date().toISOString(), message });
        await this.store.setItem(this.sessionId, log);
      } else {
        await this.store.setItem(this.sessionId, [
          { timestamp: new Date().toISOString(), message },
        ]);
      }
    }
  
    async getLog(id) {
      return await this.store.getItem(id);
    }
  
    async editLog(id, index, newMessage) {
      const log = await this.getLog(id);
      if (log) {
        log[index].message = newMessage;
        await this.store.setItem(id, log);
      }
    }
  
    async exportLogs() {
      const logs = await this.store.keys();
      const exportData = {};
      for (const logId of logs) {
        exportData[logId] = await this.getLog(logId);
      }
      return exportData;
    }
  
    async clearAllLogs() {
      await this.store.clear();
      sessionStorage.removeItem("sessionId");
    }
  
    async deleteLog(id) {
      await this.store.removeItem(id);
      if (id === this.sessionId) {
        sessionStorage.removeItem("sessionId");
      }
    }
  }