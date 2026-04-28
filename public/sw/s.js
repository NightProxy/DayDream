class SettingsAPI {

  constructor(
    file2Store = "/data/settings.json",
    folder2Store = "/data",
  ) {
    this.nfs = new NightFS();
    this.storedFilePath = file2Store;
    this.storedFolderPath = folder2Store;
    this.ready = this.nfs.init.then(() => {
      this.store = this.nfs.core.fs;
      return this.ensureFile();
    });
  }

  async ensureFile() {
    const dataDirExists = await new Promise((resolve) => {
      this.store.exists(this.storedFolderPath, resolve);
    });

    if (!dataDirExists) {
      await new Promise((resolve, reject) => {
        this.store.mkdir(this.storedFolderPath, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }

    const fileExists = await new Promise((resolve) => {
      this.store.exists(this.storedFilePath, resolve);
    });

    if (!fileExists) {
      await new Promise((resolve, reject) => {
        this.store.writeFile(this.storedFilePath, "{}", "utf8", (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }
  }

    async readData() {
    await this.ready;
    const data = await new Promise((resolve, reject) => {
      this.store.readFile(this.storedFilePath, "utf8", (err, content) =>
        err ? reject(err) : resolve(content),
      );
    });
    return JSON.parse(data);
  }

  async writeData(settings) {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.store.writeFile(
        this.storedFilePath,
        JSON.stringify(settings),
        "utf8",
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async getItem(key) {
    const settings = await this.readData();
    return settings[key] ?? null;
  }

  async setItem(key, value) {
    const settings = await this.readData();
    settings[key] = value;
    await this.writeData(settings);
    return value;
  }

  async removeItem(key) {
    const settings = await this.readData();
    delete settings[key];
    await this.writeData(settings);
  }

  async clearAllSettings() {
    await this.writeData({});
  }

  async clear() {
    await this.clearAllSettings();
  }

  async keys(){
    const settings = await this.readData();
    return Object.keys(settings);
  }
}
