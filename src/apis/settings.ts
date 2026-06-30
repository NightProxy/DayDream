import { NightFS } from "./data/fs";
import type { FSType } from "@terbiumos/tfs";

class SettingsAPI {
  nfs: NightFS;
  storedFilePath: string;
  storedFolderPath: string;
  store!: FSType;
  private ready: Promise<void>;

  constructor(
    file2Store: string = "/data/settings.json",
    folder2Store: string = "/data",
  ) {
    this.nfs = new NightFS();
    this.storedFilePath = file2Store;
    this.storedFolderPath = folder2Store;
    this.ready = this.nfs.init.then(() => {
      this.store = this.nfs.core.fs;
      return this.ensureFile();
    });
  }

  private async ensureFile(): Promise<void> {
    const dataDirExists = await new Promise<boolean>((resolve) => {
      this.store.exists(this.storedFolderPath, resolve);
    });

    if (!dataDirExists) {
      await new Promise<void>((resolve, reject) => {
        this.store.mkdir(this.storedFolderPath, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }

    const fileExists = await new Promise<boolean>((resolve) => {
      this.store.exists(this.storedFilePath, resolve);
    });

    if (!fileExists) {
      await new Promise<void>((resolve, reject) => {
        this.store.writeFile(this.storedFilePath, "{}", "utf8", (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }
  }

  private async readData(): Promise<Record<string, any>> {
    await this.ready;
    const data = await new Promise<string>((resolve, reject) => {
      this.store.readFile(this.storedFilePath, "utf8", (err, content) =>
        err ? reject(err) : resolve(content as string),
      );
    });
    return JSON.parse(data);
  }

  private async writeData(settings: Record<string, any>): Promise<void> {
    await this.ready;
    return new Promise<void>((resolve, reject) => {
      this.store.writeFile(
        this.storedFilePath,
        JSON.stringify(settings),
        "utf8",
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async getItem<T = any>(key: string): Promise<T | null> {
    const settings = await this.readData();
    return settings[key] ?? null;
  }

  async setItem(key: string, value: any): Promise<any> {
    const settings = await this.readData();
    settings[key] = value;
    await this.writeData(settings);
    return value;
  }

  async removeItem(key: string): Promise<void> {
    const settings = await this.readData();
    delete settings[key];
    await this.writeData(settings);
  }

  async clearAllSettings(): Promise<void> {
    await this.writeData({});
  }

  async clear(): Promise<void> {
    await this.clearAllSettings();
  }

  async keys(): Promise<string[]> {
    const settings = await this.readData();
    return Object.keys(settings);
  }
}

export { SettingsAPI };
