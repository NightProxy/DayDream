import type { ProfileData } from "./types";
import { PROFILE_VERSION } from "./constants";
import { getAllCookies, setCookies, clearAllCookies } from "./storage/cookies";
import {
  getAllLocalStorage,
  setLocalStorage,
  clearAllLocalStorage,
} from "./storage/localStorage";
import { getAllIDBData, setIDBData, clearAllIDB } from "./storage/indexedDB";

export class StateManager {
  async getCurrentBrowserState(): Promise<ProfileData> {
    const [cookies, localStorage, indexedDB] = await Promise.all([
      getAllCookies(),
      getAllLocalStorage(),
      getAllIDBData(),
    ]);

    return {
      cookies,
      localStorage,
      indexedDB,
      version: PROFILE_VERSION,
      timestamp: Date.now(),
    };
  }

  async applyBrowserState(state: ProfileData): Promise<void> {
    await Promise.all([
      clearAllCookies(),
      clearAllLocalStorage(),
      clearAllIDB(),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));

    await Promise.all([
      setCookies(state.cookies || {}),
      setLocalStorage(state.localStorage || {}),
      setIDBData(state.indexedDB || []),
    ]);
  }

  async clearCurrentProfileData(): Promise<boolean> {
    await Promise.all([
      clearAllCookies(),
      clearAllLocalStorage(),
      clearAllIDB(),
    ]);

    return true;
  }

  async flushStorageOperations(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  emergencySaveProfile(userID: string): boolean {
    try {
      const cookies: Record<string, string> = {};
      const localStorage: Record<string, string> = {};

      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            const value = window.localStorage.getItem(key);
            if (value !== null) {
              localStorage[key] = value;
            }
          }
        }
      } catch (e) {
        console.error("Error collecting localStorage in emergency save:", e);
      }

      try {
        if (document.cookie) {
          document.cookie.split(";").forEach((cookie) => {
            const [name, ...rest] = cookie.trim().split("=");
            if (name) {
              cookies[name] = rest.join("=");
            }
          });
        }
      } catch (e) {
        console.error("Error collecting cookies in emergency save:", e);
      }

      const emergencyData: ProfileData = {
        cookies,
        localStorage,
        indexedDB: [],
        version: PROFILE_VERSION,
        timestamp: Date.now(),
      };

      const backupKey = `__emergency_profile_backup_${userID}__`;
      window.localStorage.setItem(backupKey, JSON.stringify(emergencyData));

      return true;
    } catch (error) {
      console.error(`Failed emergency save for profile "${userID}":`, error);
      return false;
    }
  }
}
