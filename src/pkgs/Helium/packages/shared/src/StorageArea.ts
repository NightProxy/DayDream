import { ChromeEvent } from './ChromeEvent';

/**
 * Base class for chrome.storage areas (local, sync, managed, session).
 * Provides get/getKeys/set/remove/clear/getBytesInUse/setAccessLevel with an onChanged event.
 */
export class StorageArea {
  protected store: Record<string, any> = {};
  public readonly onChanged: ChromeEvent = new ChromeEvent();

  /** Quota constants - set per-instance based on the area type. */
  public QUOTA_BYTES?: number;
  public QUOTA_BYTES_PER_ITEM?: number;
  public MAX_ITEMS?: number;
  public MAX_WRITE_OPERATIONS_PER_HOUR?: number;
  public MAX_WRITE_OPERATIONS_PER_MINUTE?: number;
  public MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE?: number;

  /**
   * Gets one or more items from storage.
   */
  get(keys?: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void): void {
    let result: Record<string, any> = {};

    if (keys === null || keys === undefined) {
      result = { ...this.store };
    } else if (typeof keys === 'string') {
      if (keys in this.store) {
        result[keys] = this.store[keys];
      }
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        if (key in this.store) {
          result[key] = this.store[key];
        }
      }
    } else {
      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = key in this.store ? this.store[key] : defaultValue;
      }
    }

    if (callback) {
      callback(result);
    }
  }

  /**
   * Gets all keys currently in storage.
   */
  getKeys(callback?: (keys: string[]) => void): void {
    if (callback) {
      callback(Object.keys(this.store));
    }
  }

  /**
   * Sets multiple items.
   */
  set(items: Record<string, any>, callback?: () => void): void {
    const changes: Record<string, { oldValue?: any; newValue: any }> = {};

    for (const [key, value] of Object.entries(items)) {
      const oldValue = this.store[key];
      this.store[key] = value;
      changes[key] = { newValue: value };
      if (oldValue !== undefined) {
        changes[key].oldValue = oldValue;
      }
    }

    if (Object.keys(changes).length > 0) {
      this.onChanged.dispatch(changes);
    }

    if (callback) {
      callback();
    }
  }

  /**
   * Removes one or more items from storage.
   */
  remove(keys: string | string[], callback?: () => void): void {
    const keyArray = typeof keys === 'string' ? [keys] : keys;
    const changes: Record<string, { oldValue: any }> = {};

    for (const key of keyArray) {
      if (key in this.store) {
        changes[key] = { oldValue: this.store[key] };
        delete this.store[key];
      }
    }

    if (Object.keys(changes).length > 0) {
      this.onChanged.dispatch(changes);
    }

    if (callback) {
      callback();
    }
  }

  /**
   * Removes all items from storage.
   */
  clear(callback?: () => void): void {
    const changes: Record<string, { oldValue: any }> = {};
    for (const [key, value] of Object.entries(this.store)) {
      changes[key] = { oldValue: value };
    }

    this.store = {};

    if (Object.keys(changes).length > 0) {
      this.onChanged.dispatch(changes);
    }

    if (callback) {
      callback();
    }
  }

  /**
   * Gets the amount of space (in bytes) being used by one or more items.
   */
  getBytesInUse(keys?: string | string[] | null, callback?: (bytesInUse: number) => void): void {
    let size = 0;
    const keysToCheck =
      keys === null || keys === undefined
        ? Object.keys(this.store)
        : typeof keys === 'string'
          ? [keys]
          : keys;

    for (const key of keysToCheck) {
      if (key in this.store) {
        size += JSON.stringify(this.store[key]).length + key.length;
      }
    }

    if (callback) {
      callback(size);
    }
  }

  /**
   * Sets the desired access level for the storage area.
   */
  setAccessLevel(accessOptions: { accessLevel: string }, callback?: () => void): void {
    if (callback) {
      callback();
    }
  }
}
