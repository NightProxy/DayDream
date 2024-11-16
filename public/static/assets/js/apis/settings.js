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
}
