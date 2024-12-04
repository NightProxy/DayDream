class SettingsAPI {
  constructor() {
    this.store = localforage.createInstance({
      name: "settings",
      storeName: "settings",
    });
  }

  async getItem(key) {
    return await this.store.getItem(key);
  }

  async setItem(key, value) {
    return await this.store.setItem(key, value);
  }

  async removeItem(key) {
    return await this.store.removeItem(key);
  }

  async clearAllSettings() {
    return await this.store.clear();
  }

  async deleteDatabase(dbName) {
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(dbName);

      deleteRequest.onsuccess = () => {
        console.log(`Database '${dbName}' deleted successfully.`);
        resolve();
      };

      deleteRequest.onerror = (event) => {
        console.error(
          `Failed to delete database '${dbName}':`,
          event.target.error
        );
        reject(event.target.error);
      };

      deleteRequest.onblocked = () => {
        console.warn(
          `Database '${dbName}' deletion is blocked. Close other tabs or processes using the database.`
        );
      };
    });
  }
}
