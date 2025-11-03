import type { ProfileExport } from "./types";
import { getAllCookies } from "./storage/cookies";
import { getAllLocalStorage } from "./storage/localStorage";
import { getAllIDBData } from "./storage/indexedDB";

export class ExportManager {
  private getCurrentProfileFn: () => string | null;

  constructor(getCurrentProfile: () => string | null) {
    this.getCurrentProfileFn = getCurrentProfile;
  }

  async exportCurrentProfile(): Promise<ProfileExport> {
    const [indexedDB, localStorage, cookies] = await Promise.all([
      getAllIDBData(),
      getAllLocalStorage(),
      getAllCookies(),
    ]);

    return {
      profileId: this.getCurrentProfileFn(),
      timestamp: new Date().toISOString(),
      indexedDB,
      localStorage,
      cookies,
    };
  }

  async downloadExport(filename: string | null = null): Promise<boolean> {
    try {
      const exportData = await this.exportCurrentProfile();

      let finalFilename: string;
      if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const profileName = this.getCurrentProfileFn() || "unknown";
        finalFilename = `profile-export-${profileName}-${timestamp}.json`;
      } else {
        finalFilename = filename;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error("Failed to download export:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error("Failed to download export: " + errorMessage);
    }
  }

  encode(data: any): string {
    console.warn("encode() is deprecated in v2");
    return JSON.stringify(data);
  }

  decode(encodedData: string): any {
    console.warn("decode() is deprecated in v2");
    try {
      return JSON.parse(encodedData);
    } catch (e) {
      return null;
    }
  }
}
