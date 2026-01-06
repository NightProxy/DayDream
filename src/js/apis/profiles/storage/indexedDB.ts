import type { DatabaseExport } from "../types";
import { SYSTEM_DBS } from "../constants";

function isUserDatabase(dbName: string): boolean {
  return !SYSTEM_DBS.includes(dbName);
}

export async function getAllIDBData(): Promise<DatabaseExport[]> {
  try {
    const databases = await indexedDB.databases();
    const userDatabases = databases.filter((db) =>
      isUserDatabase(db.name || ""),
    );

    const exports: DatabaseExport[] = [];

    for (const dbInfo of userDatabases) {
      if (!dbInfo.name) continue;

      try {
        const dbExport = await exportSingleDatabase(dbInfo.name);
        if (dbExport) {
          exports.push(dbExport);
        }
      } catch (error) {
        console.warn(`Failed to export database ${dbInfo.name}:`, error);
      }
    }

    return exports;
  } catch (error) {
    console.error("Failed to get IndexedDB data:", error);
    return [];
  }
}

export async function setIDBData(databases: DatabaseExport[]): Promise<void> {
  for (const db of databases) {
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await restoreDatabase(db);
        success = true;
        break;
      } catch (error) {
        console.warn(
          `Attempt ${attempt}/3 failed for database ${db.name}:`,
          error,
        );
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }
    if (!success) {
      console.error(`Skipping database ${db.name} after 3 failed attempts`);
    }
  }
}

export async function clearAllIDB(): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    const userDatabases = databases.filter((db) =>
      isUserDatabase(db.name || ""),
    );

    for (const dbInfo of userDatabases) {
      if (!dbInfo.name) continue;

      try {
        await new Promise<void>((resolve, reject) => {
          const deleteRequest = indexedDB.deleteDatabase(dbInfo.name!);

          const timeout = setTimeout(() => {
            reject(new Error(`Timeout deleting database ${dbInfo.name}`));
          }, 3000);

          deleteRequest.onsuccess = () => {
            clearTimeout(timeout);
            resolve();
          };

          deleteRequest.onerror = () => {
            clearTimeout(timeout);
            reject(deleteRequest.error);
          };

          deleteRequest.onblocked = () => {
            clearTimeout(timeout);
            console.warn(`Database ${dbInfo.name} is blocked`);
            resolve();
          };
        });
      } catch (error) {
        console.warn(`Error deleting database ${dbInfo.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Failed to clear IndexedDB:", error);
  }
}

async function exportSingleDatabase(
  dbName: string,
): Promise<DatabaseExport | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout opening database ${dbName}`));
    }, 5000);

    const request = indexedDB.open(dbName);

    request.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to open database ${dbName}`));
    };

    request.onsuccess = async (event: Event) => {
      clearTimeout(timeout);
      const db = (event.target as IDBOpenDBRequest).result;

      try {
        const storeNames = Array.from(db.objectStoreNames);
        const storeData: Record<string, any[]> = {};

        for (const storeName of storeNames) {
          try {
            storeData[storeName] = await exportObjectStore(db, storeName);
          } catch (error) {
            console.warn(
              `Failed to export store ${storeName} from ${dbName}:`,
              error,
            );
            storeData[storeName] = [];
          }
        }

        db.close();

        resolve({
          name: dbName,
          version: db.version,
          data: storeData,
        });
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

async function exportObjectStore(
  db: IDBDatabase,
  storeName: string,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const data: any[] = [];
      const request = store.openCursor();

      request.onerror = () => {
        reject(new Error(`Failed to read from store ${storeName}`));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          data.push({
            key: cursor.key,
            value: cursor.value,
          });
          cursor.continue();
        } else {
          resolve(data);
        }
      };
    } catch (error) {
      reject(error);
    }
  });
}

async function restoreDatabase(dbExport: DatabaseExport): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout restoring database ${dbExport.name}`));
    }, 10000);

    const deleteRequest = indexedDB.deleteDatabase(dbExport.name);

    deleteRequest.onsuccess = () => {
      const openRequest = indexedDB.open(dbExport.name, dbExport.version);

      openRequest.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to open database ${dbExport.name}`));
      };

      openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          for (const [storeName, storeData] of Object.entries(dbExport.data)) {
            if (!db.objectStoreNames.contains(storeName)) {
              if (Array.isArray(storeData) && storeData.length > 0) {
                const firstItem = storeData[0];
                if (
                  firstItem &&
                  typeof firstItem === "object" &&
                  "key" in firstItem
                ) {
                  db.createObjectStore(storeName);
                } else {
                  db.createObjectStore(storeName, {
                    autoIncrement: true,
                  });
                }
              } else {
                db.createObjectStore(storeName);
              }
            }
          }
        } catch (error) {
          console.error(`Error creating stores for ${dbExport.name}:`, error);
        }
      };

      openRequest.onsuccess = async (event: Event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          const storeNames = Object.keys(dbExport.data);
          if (storeNames.length === 0) {
            clearTimeout(timeout);
            db.close();
            resolve();
            return;
          }

          const transaction = db.transaction(storeNames, "readwrite");

          transaction.oncomplete = () => {
            clearTimeout(timeout);
            db.close();
            resolve();
          };

          transaction.onerror = () => {
            clearTimeout(timeout);
            db.close();
            reject(new Error(`Transaction failed for ${dbExport.name}`));
          };

          for (const [storeName, storeData] of Object.entries(dbExport.data)) {
            try {
              const store = transaction.objectStore(storeName);
              store.clear();

              if (Array.isArray(storeData)) {
                for (const item of storeData) {
                  if (
                    item &&
                    typeof item === "object" &&
                    "key" in item &&
                    "value" in item
                  ) {
                    store.put(item.value, item.key);
                  } else {
                    store.add(item);
                  }
                }
              }
            } catch (error) {
              console.warn(`Error populating store ${storeName}:`, error);
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          db.close();
          reject(error);
        }
      };
    };

    deleteRequest.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to delete existing database ${dbExport.name}`));
    };

    deleteRequest.onblocked = () => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Delete operation blocked for database ${dbExport.name}. Close all connections to this database and try again.`,
        ),
      );
    };
  });
}

export async function setIDBDataLegacy(
  data: Record<string, any>,
): Promise<void> {
  const databases: DatabaseExport[] = Object.entries(data).map(
    ([name, dbData]) => ({
      name,
      version: 1,
      data: dbData as Record<string, any[]>,
    }),
  );
  await setIDBData(databases);
}
