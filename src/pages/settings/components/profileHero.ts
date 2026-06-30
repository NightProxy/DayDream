import { createIcons, icons } from "lucide";
import { createAvatar } from "../data/profileAppearance";
import type { ProfileData } from "../../../apis/profiles/types";

export interface HeroCallbacks {
  onSwitch: () => void;
  onManage: () => void;
}

export interface HeroStats {
  bookmarkCount: number;
  siteGrantCount: number;
  storageMB: number;
}

export async function computeStats(_profileId: string, data: ProfileData | null): Promise<HeroStats> {
  let bookmarkCount = 0;
  try {
    const mod = await import("../../../apis/bookmarks");
    bookmarkCount = mod.BookmarkManager.getInstance().getBookmarks().length;
  } catch { /* not initialized yet */ }

  let siteGrantCount = 0;
  try {
    const sps = window.sitePermissionsStore;
    if (sps && typeof sps.listAll === "function") {
      const grants = await sps.listAll();
      siteGrantCount = new Set(grants.map((g: { origin: string }) => g.origin)).size;
    }
  } catch { /* ignore */ }

  let bytes = 0;
  if (data) {
    try {
      bytes += JSON.stringify(data.cookies).length;
      bytes += JSON.stringify(data.localStorage).length;
      bytes += JSON.stringify(data.indexedDB).length;
    } catch { /* ignore */ }
  }
  const storageMB = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return { bookmarkCount, siteGrantCount, storageMB };
}

export function createProfileHero(profileId: string, data: ProfileData | null, stats: HeroStats, cbs: HeroCallbacks): HTMLElement {
  const root = document.createElement("div");
  root.className = "profile-hero";

  const avatar = createAvatar(profileId, data?.appearance, { size: 64 });
  root.appendChild(avatar);

  const meta = document.createElement("div");
  meta.className = "hero-meta";
  const name = document.createElement("div");
  name.className = "hero-name";
  name.textContent = profileId;
  meta.appendChild(name);
  const statsLine = document.createElement("div");
  statsLine.className = "hero-stats";
  statsLine.textContent = `Active · ${stats.bookmarkCount} bookmarks · ${stats.siteGrantCount} sites · ${stats.storageMB} MB`;
  meta.appendChild(statsLine);
  root.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "hero-actions";

  const switchBtn = document.createElement("button");
  switchBtn.className = "settings-button ghost";
  switchBtn.textContent = "Switch";
  switchBtn.addEventListener("click", cbs.onSwitch);
  actions.appendChild(switchBtn);

  const manageBtn = document.createElement("button");
  manageBtn.className = "settings-button";
  manageBtn.textContent = "Manage";
  manageBtn.addEventListener("click", cbs.onManage);
  actions.appendChild(manageBtn);

  root.appendChild(actions);

  queueMicrotask(() => createIcons({ icons }));
  return root;
}
