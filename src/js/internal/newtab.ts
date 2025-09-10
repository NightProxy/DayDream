import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "../global/panic";
import "./shared/themeInit";
import { createIcons, icons } from "lucide";

import { BookmarkManager, isBookmark } from "@apis/bookmarks";
import { Proxy } from "@apis/proxy";
interface Shortcut {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

class NewTabShortcuts {
  private bookmarkManager: BookmarkManager;
  private proxy: Proxy;
  private shortcuts: Shortcut[] = [];
  private currentEditingId: string | null = null;

  private defaultShortcuts: Omit<Shortcut, "id" | "favicon">[] = [
    { title: "Google", url: "https://google.com" },
    { title: "YouTube", url: "https://youtube.com" },
    { title: "GitHub", url: "https://github.com" },
    { title: "Reddit", url: "https://reddit.com" },
    { title: "Twitter", url: "https://twitter.com" },
    { title: "Wikipedia", url: "https://wikipedia.org" },
    { title: "Stack Overflow", url: "https://stackoverflow.com" },
    { title: "Discord", url: "https://discord.com" },
    { title: "Netflix", url: "https://netflix.com" },
    { title: "Amazon", url: "https://amazon.com" },
    { title: "Spotify", url: "https://spotify.com" },
    { title: "Twitch", url: "https://twitch.tv" },
  ];

  constructor() {
    this.bookmarkManager = new BookmarkManager();
    this.proxy = new Proxy();

    this.proxy.setBookmarkManager(this.bookmarkManager);

    this.init();
  }

  private async init() {
    await this.bookmarkManager.loadFromStorage();
    await this.loadShortcuts();
    this.renderShortcuts();
    this.setupEventListeners();
    createIcons({ icons });
  }

  private async getFavicon(url: string): Promise<string> {
    try {
      const cachedFavicon = this.bookmarkManager.getCachedFavicon(url);
      if (cachedFavicon) {
        return cachedFavicon;
      }

      const faviconUrl = await this.proxy.getFavicon(url);
      return faviconUrl || this.getFallbackFavicon();
    } catch (error) {
      console.warn("Failed to get favicon for", url, error);
      return this.getFallbackFavicon();
    }
  }

  private getFallbackFavicon(): string {
    return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMTVBNyA3IDAgMSAwIDggMUE3IDcgMCAwIDAgOCAxNVoiIGZpbGw9IiNFNUU3RUIiLz4KPHBhdGggZD0iTTggMTJBNCA0IDAgMSAwIDggNEE0IDQgMCAwIDAgOCAxMloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+";
  }

  private async loadShortcuts() {
    try {
      const folders = this.bookmarkManager.getFolders();
      let shortcutsFolder = folders.find(
        (f) => f.title.toLowerCase() === "shortcuts",
      );

      if (!shortcutsFolder) {
        await this.createDefaultShortcuts();
        const updatedFolders = this.bookmarkManager.getFolders();
        shortcutsFolder = updatedFolders.find(
          (f) => f.title.toLowerCase() === "shortcuts",
        );
      }

      if (shortcutsFolder) {
        const shortcutBookmarks = this.bookmarkManager
          .getItemsByParent(shortcutsFolder.id)
          .filter((item) => isBookmark(item))
          .slice(0, 12);

        this.shortcuts = await Promise.all(
          shortcutBookmarks.map(async (bookmark) => {
            if (isBookmark(bookmark)) {
              return {
                id: bookmark.id,
                title: bookmark.title,
                url: bookmark.url,
                favicon: await this.getFavicon(bookmark.url),
              };
            }
            return null;
          }),
        ).then((results) => results.filter(Boolean) as Shortcut[]);
      }
    } catch (error) {
      console.error("Failed to load shortcuts:", error);
      if (this.shortcuts.length === 0) {
        await this.createDefaultShortcuts();
      }
    }
  }

  private async createDefaultShortcuts() {
    const shortcutsFolderId = await this.getOrCreateShortcutsFolder();

    const existingBookmarks = this.bookmarkManager
      .getItemsByParent(shortcutsFolderId)
      .filter((item) => isBookmark(item));

    if (existingBookmarks.length > 0) {
      return;
    }

    for (const defaultShortcut of this.defaultShortcuts) {
      try {
        await this.bookmarkManager.createBookmark({
          title: defaultShortcut.title,
          url: defaultShortcut.url,
          parentId: shortcutsFolderId,
        });
      } catch (error) {
        console.error(
          `Failed to create shortcut for ${defaultShortcut.title}:`,
          error,
        );
      }
    }
  }

  private async getOrCreateShortcutsFolder(): Promise<string> {
    const folders = this.bookmarkManager.getFolders();
    let shortcutsFolder = folders.find(
      (f) => f.title.toLowerCase() === "shortcuts",
    );

    if (!shortcutsFolder) {
      shortcutsFolder = await this.bookmarkManager.createFolder({
        title: "Shortcuts",
      });
    }

    return shortcutsFolder.id;
  }

  private renderShortcuts() {
    const section = document.getElementById("shortcuts-section");
    if (!section) return;

    section.innerHTML = "";

    this.shortcuts.forEach((shortcut) => {
      const shortcutElement = this.createShortcutElement(shortcut);
      section.appendChild(shortcutElement);
    });

    const remaining = 12 - this.shortcuts.length;
    for (let i = 0; i < remaining; i++) {
      const emptySlot = this.createEmptySlot();
      section.appendChild(emptySlot);
    }

    setTimeout(() => createIcons({ icons }), 0);
  }

  private createShortcutElement(shortcut: Shortcut): HTMLElement {
    const shortcutDiv = document.createElement("div");
    shortcutDiv.className = "shortcut-item relative group";

    shortcutDiv.innerHTML = `
      <div class="shortcut-link block relative rounded-xl bg-[var(--bg-2)] p-3 h-24 ring-1 ring-inset ring-[var(--white-08)] shadow-[0_0_1px_var(--shadow-outer)] hover:ring-[var(--main-35a)] transition group cursor-pointer">
        <div class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-8 h-8 mb-2 flex items-center justify-center">
            <img
              src="${shortcut.favicon || this.getFallbackFavicon()}"
              alt="${shortcut.title}"
              class="w-8 h-8 object-contain"
              onerror="this.src='${this.getFallbackFavicon()}'"
            />
          </div>
          <span class="text-xs text-[var(--text)] font-medium truncate w-full">${shortcut.title}</span>
        </div>
      </div>
      <button
        class="edit-shortcut-btn absolute -top-1 -right-1 w-6 h-6 bg-[var(--bg-1)] border border-[var(--white-20)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-[var(--white-10)]"
        title="Edit shortcut"
      >
        <i data-lucide="edit" class="h-3 w-3 text-[var(--text-secondary)]"></i>
      </button>
    `;

    const linkElement = shortcutDiv.querySelector(
      ".shortcut-link",
    ) as HTMLElement;
    linkElement.addEventListener("click", (e) => {
      e.preventDefault();
      this.handleShortcutNavigation(shortcut.url);
    });

    const editBtn = shortcutDiv.querySelector(
      ".edit-shortcut-btn",
    ) as HTMLElement;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openEditShortcutModal(shortcut.id);
    });

    return shortcutDiv;
  }

  private handleShortcutNavigation(url: string): void {
    try {
      if (url.startsWith("javascript:")) {
        const js = url.slice("javascript:".length);
        eval(js);
        return;
      }

      window.parent.protocols.navigate(url);
    } catch (error) {
      console.error("Failed to navigate:", error);
      window.open(url, "_blank");
    }
  }

  private createEmptySlot(): HTMLElement {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-slot relative group cursor-pointer";
    emptyDiv.innerHTML = `
      <div class="block relative rounded-xl bg-[var(--bg-2)] border-2 border-dashed border-[var(--white-20)] p-3 h-24 hover:border-[var(--main-35a)] transition group">
        <div class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-8 h-8 mb-2 flex items-center justify-center">
            <i data-lucide="plus" class="w-6 h-6 text-[var(--white-50)]"></i>
          </div>
          <span class="text-xs text-[var(--white-50)] font-medium">Add shortcut</span>
        </div>
      </div>
    `;

    emptyDiv.addEventListener("click", () => this.openAddShortcutModal());
    return emptyDiv;
  }

  private setupEventListeners() {
    document.addEventListener("click", (e) => {
      const editBtn = (e.target as HTMLElement).closest(".edit-shortcut-btn");
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const shortcutId = editBtn.getAttribute("data-shortcut-id");
        if (shortcutId) {
          this.openEditShortcutModal(shortcutId);
        }
      }
    });

    const modal = document.getElementById("editShortcutModal");
    const form = document.getElementById("editShortcutForm") as HTMLFormElement;
    const cancelBtn = document.getElementById("cancelEditShortcut");

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.closeModal());
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => this.handleSubmit(e));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isModalOpen()) {
        this.closeModal();
      }
    });
  }

  private openEditShortcutModal(shortcutId: string) {
    const shortcut = this.shortcuts.find((s) => s.id === shortcutId);
    if (!shortcut) return;

    this.currentEditingId = shortcutId;

    const titleInput = document.getElementById(
      "shortcutTitle",
    ) as HTMLInputElement;
    const urlInput = document.getElementById("shortcutUrl") as HTMLInputElement;

    if (titleInput) titleInput.value = shortcut.title;
    if (urlInput) urlInput.value = shortcut.url;

    this.showModal();
  }

  private openAddShortcutModal() {
    this.currentEditingId = null;

    const titleInput = document.getElementById(
      "shortcutTitle",
    ) as HTMLInputElement;
    const urlInput = document.getElementById("shortcutUrl") as HTMLInputElement;

    if (titleInput) titleInput.value = "";
    if (urlInput) urlInput.value = "";

    this.showModal();
  }

  private showModal() {
    const modal = document.getElementById("editShortcutModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      const titleInput = document.getElementById(
        "shortcutTitle",
      ) as HTMLInputElement;
      if (titleInput) {
        setTimeout(() => titleInput.focus(), 100);
      }
    }
  }

  private closeModal() {
    const modal = document.getElementById("editShortcutModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
    this.currentEditingId = null;
  }

  private isModalOpen(): boolean {
    const modal = document.getElementById("editShortcutModal");
    return modal ? !modal.classList.contains("hidden") : false;
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    const titleInput = document.getElementById(
      "shortcutTitle",
    ) as HTMLInputElement;
    const urlInput = document.getElementById("shortcutUrl") as HTMLInputElement;

    if (!titleInput || !urlInput) return;

    const title = titleInput.value.trim();
    const url = urlInput.value.trim();

    if (!title || !url) return;

    try {
      if (this.currentEditingId) {
        await this.bookmarkManager.updateBookmark(this.currentEditingId, {
          title,
          url,
        });

        await this.loadShortcuts();
        this.renderShortcuts();
      } else {
        if (this.shortcuts.length >= 12) {
          alert("Maximum of 12 shortcuts allowed");
          return;
        }

        const shortcutsFolderId = await this.getOrCreateShortcutsFolder();
        await this.bookmarkManager.createBookmark({
          title,
          url,
          parentId: shortcutsFolderId,
        });

        await this.loadShortcuts();
        this.renderShortcuts();
      }

      this.closeModal();
    } catch (error) {
      console.error("Failed to save shortcut:", error);
      alert("Failed to save shortcut. Please try again.");
    }
  }

  public async refresh() {
    await this.bookmarkManager.loadFromStorage();
    await this.loadShortcuts();
    this.renderShortcuts();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  createIcons({ icons });
  const shortcutsManager = new NewTabShortcuts();
  (window as any).shortcutsManager = shortcutsManager;

  const input = document.getElementById("searchInput") as HTMLInputElement;
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const value = input.value.trim();
        window.parent.protocols.navigate(window.parent.proxy.search(value));
      }
    });
  }

  const links = document.querySelectorAll("a");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.getAttribute("href");
      if (url) {
        window.parent.protocols.navigate(url);
      }
    });
  });
});
