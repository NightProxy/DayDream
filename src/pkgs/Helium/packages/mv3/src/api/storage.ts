import { ChromeEvent, StorageArea } from '@anthropic/chrome-api-shared';

class ChromeStorageSync extends StorageArea {
  static readonly QUOTA_BYTES: number = 102400;
  static readonly QUOTA_BYTES_PER_ITEM: number = 8192;
  static readonly MAX_ITEMS: number = 512;
  static readonly MAX_WRITE_OPERATIONS_PER_HOUR: number = 1800;
  static readonly MAX_WRITE_OPERATIONS_PER_MINUTE: number = 120;
  static readonly MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: number = 1000000;
}

class ChromeStorageSession extends StorageArea {
  static readonly QUOTA_BYTES: number = 10485760;
}

class ChromeStorageManaged extends StorageArea {
}

class ChromeStorageLocal extends StorageArea {
  static readonly QUOTA_BYTES: number = 10485760;
}

export class ChromeStorage {
  public readonly onChanged: ChromeEvent = new ChromeEvent();
  public readonly sync: ChromeStorageSync = new ChromeStorageSync();
  public readonly session: ChromeStorageSession = new ChromeStorageSession();
  public readonly managed: ChromeStorageManaged = new ChromeStorageManaged();
  public readonly local: ChromeStorageLocal = new ChromeStorageLocal();

  static readonly AccessLevel = {
    TRUSTED_AND_UNTRUSTED_CONTEXTS: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    TRUSTED_CONTEXTS: "TRUSTED_CONTEXTS",
  } as const;

}
