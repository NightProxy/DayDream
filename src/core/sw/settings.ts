import { getScopedNightFs } from "@apis/data/scopedNightFs";
import type { StorageWorkerRequest } from "@apis/data/storageWorkerProtocol";
import {
  StorageWorkerService,
  type StorageFileSystem,
} from "@apis/data/storageWorkerService";

export interface StorageRequestExecutor {
  execute(request: StorageWorkerRequest): Promise<unknown>;
}

// Service-worker settings live under /app/sw-settings/ in OPFS so the
// scoped NightFS has its own .TFS_STORE and never races the profile
// buckets, the logger, the SW HTTP cache, or the extension store.
function createLocalExecutor(): StorageRequestExecutor {
  const nfs = getScopedNightFs("app/sw-settings");
  const fileSystem = nfs.init.then(
    () => nfs.core.fs as unknown as StorageFileSystem,
  );
  return new StorageWorkerService(fileSystem, null, "__sw__");
}

export class ServiceWorkerSettings {
  private nextId = 1;

  constructor(
    private readonly executor: StorageRequestExecutor = createLocalExecutor(),
    private readonly filePath = "/settings.json",
    private readonly folderPath = "/",
  ) {}

  async getItem<T>(key: string): Promise<T | null> {
    return (await this.executor.execute({
      id: this.nextId++,
      operation: "getItem",
      filePath: this.filePath,
      folderPath: this.folderPath,
      key,
    })) as T | null;
  }

  async setItem<T>(key: string, value: T): Promise<T> {
    return (await this.executor.execute({
      id: this.nextId++,
      operation: "setItem",
      filePath: this.filePath,
      folderPath: this.folderPath,
      key,
      value,
    })) as T;
  }
}
