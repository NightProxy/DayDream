import { SettingsAPI } from "@apis/settings";
import { globalTheming } from "@utils/global/theming";
import { chromeManifestToThemePreset } from "@utils/global/chromeThemeMapper";
import type { ChromeManifest } from "@core/helium/shared/unpack/types";
import type { ThemePreset } from "@utils/global/theming";

const STORE_KEY = "extensionThemes";
const settings = new SettingsAPI();

interface ExtThemeEntry {
  extId: string;
  preset: ThemePreset;
  installedAt: number;
}

export class ChromeThemeAdapter {
  static isThemeManifest(m: ChromeManifest): boolean {
    return !!(m as any).theme && typeof (m as any).theme === "object";
  }

  static extThemeId(extId: string): string {
    return `ext:${extId}`;
  }

  async onExtensionInstalled(
    extId: string,
    manifest: ChromeManifest,
    files: Map<string, Uint8Array>,
  ): Promise<void> {
    if (!ChromeThemeAdapter.isThemeManifest(manifest)) return;
    const preset = chromeManifestToThemePreset(manifest, files, extId);
    const store = await this.loadStore();
    store[extId] = { extId, preset, installedAt: Date.now() };
    await settings.setItem(STORE_KEY, store);
    this.emitListChanged();
  }

  async onExtensionRemoved(extId: string): Promise<void> {
    const store = await this.loadStore();
    if (!store[extId]) return;
    delete store[extId];
    await settings.setItem(STORE_KEY, store);
    const current = await settings.getItem("currentTheme");
    if (current === ChromeThemeAdapter.extThemeId(extId)) {
      await (globalTheming as any).applyTheme?.("daydreamer");
      await settings.setItem("currentTheme", "daydreamer");
    }
    this.emitListChanged();
  }

  async onExtensionDisabled(extId: string): Promise<void> {
    const current = await settings.getItem("currentTheme");
    if (current === ChromeThemeAdapter.extThemeId(extId)) {
      await (globalTheming as any).applyTheme?.("daydreamer");
      await settings.setItem("currentTheme", "daydreamer");
    }
    this.emitListChanged();
  }

  async onExtensionEnabled(_extId: string): Promise<void> {
    this.emitListChanged();
  }

  async listExtensionThemes(): Promise<Array<{ id: string; preset: ThemePreset }>> {
    const store = await this.loadStore();
    return Object.values(store).map((e) => ({
      id: ChromeThemeAdapter.extThemeId(e.extId),
      preset: e.preset,
    }));
  }

  private async loadStore(): Promise<Record<string, ExtThemeEntry>> {
    const raw = await settings.getItem(STORE_KEY);
    return (raw && typeof raw === "object") ? raw as Record<string, ExtThemeEntry> : {};
  }

  private emitListChanged(): void {
    try { (window as any).eventsAPI?.emit?.("theme:preset-list-changed", null); }
    catch { /* ignore */ }
  }
}

export const chromeThemeAdapter = new ChromeThemeAdapter();
