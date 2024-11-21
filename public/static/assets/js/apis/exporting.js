class DataExportAPI {
  constructor() {}
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

        transaction.oncomplete = () => {
          resolve({ name: databaseName, data });
        };

        transaction.onerror = (event) => {
          reject(event.target.error);
        };

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

          request.onerror = (event) => {
            reject(event.target.error);
          };
        }
      };

      dbRequest.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  decodeBase64(dataUrl) {
    const base64String = dataUrl.split(",")[1];
    return window.atob(base64String);
  }

  getAllIDBData() {
    return indexedDB.databases().then((databases) => {
      let promises = databases.map((dbInfo) => this.getIDBData(dbInfo.name));
      return Promise.all(promises);
    });
  }

  exportData(fileName) {
    this.getAllIDBData()
      .then((idbData) => {
        let data = {
          idbData: JSON.stringify(idbData),
          localStorageData: JSON.stringify(localStorage),
          cookies: this.extractCookies(),
        };

        let jsonData = JSON.stringify(data);
        let encryptedData = this.base6xorEncrypt(jsonData);

        let blob = new Blob([encryptedData], {
          type: "application/octet-stream",
        });

        if (window.navigator.msSaveOrOpenBlob) {
          window.navigator.msSaveBlob(blob, fileName);
        } else {
          let a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      })
      .catch((err) => {
        console.error("An error occurred during the export of data:", err);
      });
  }

  importData(input) {
    let fileInput = input;
    let file = fileInput.files[0];
    let reader = new FileReader();

    reader.onload = (e) => {
      try {
        let decryptedDataJSON = this.base6xorDecrypt(e.target.result);
        let decryptedData = JSON.parse(decryptedDataJSON);

        let idbData = JSON.parse(decryptedData.idbData);
        let idbPromises = idbData.map((dbInfo) => {
          return new Promise((resolve, reject) => {
            let dbRequest = indexedDB.open(dbInfo.name);

            dbRequest.onsuccess = (event) => {
              let db = event.target.result;
              let transaction = db.transaction(
                db.objectStoreNames,
                "readwrite",
              );

              transaction.oncomplete = () => {
                resolve();
              };

              transaction.onerror = (event) => {
                reject(event.target.error);
              };

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

            dbRequest.onerror = (event) => {
              reject(event.target.error);
            };
          });
        });

        localStorage.clear();
        let localStorageData = JSON.parse(decryptedData.localStorageData);
        for (let key in localStorageData) {
          localStorage.setItem(key, localStorageData[key]);
        }

        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(
              /=.*/,
              "=;expires=" + new Date().toUTCString() + ";path=/",
            );
        });

        let cookieData = decryptedData.cookies;
        for (let key in cookieData) {
          document.cookie = key + "=" + cookieData[key] + ";path=/";
        }

        Promise.all(idbPromises)
          .then(() => {
            window.location.reload();
          })
          .catch((err) => {
            console.error("An error occurred during the import of data:", err);
          });
      } catch (error) {
        console.error("Error during import:", error);
        alert(
          "An error occurred during the import of data. Please ensure the file is correct and try again.",
        );
      }
    };

    reader.readAsText(file);
  }
}
