import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "basecoat-css/all";
import { createIcons, icons } from "lucide";

import {
  BookmarkManager,
  type Bookmark,
  type BookmarkFolder,
  type BookmarkTreeNode,
} from "../apis/bookmarks";
import { Proxy } from "../apis/proxy";

class BookmarkManagerUI {
  private bookmarkManager: BookmarkManager;
  private proxy: Proxy;
  private currentFolderId: string = "";
  private isGridView: boolean = false;
  private searchQuery: string = "";
  private sortBy: "title" | "url" | "createdAt" = "title";
  private contextMenu: HTMLElement | null = null;
  private contextTarget: Bookmark | BookmarkFolder | null = null;

  // UI Elements
  private folderTree: HTMLElement;
  private bookmarkList: HTMLElement;
  private emptyState: HTMLElement;
  private currentFolderTitle: HTMLElement;
  private bookmarkCount: HTMLElement;
  private searchInput: HTMLInputElement;
  private sortSelect: HTMLSelectElement;
  private viewToggle: HTMLButtonElement;

  // Modals
  private addBookmarkModal: HTMLElement;
  private addFolderModal: HTMLElement;

  constructor() {
    this.bookmarkManager = new BookmarkManager();
    this.proxy = new Proxy();

    // Connect bookmark manager to proxy for favicon caching
    this.proxy.setBookmarkManager(this.bookmarkManager);

    // Initialize UI elements
    this.folderTree = document.getElementById("folderTree")!;
    this.bookmarkList = document.getElementById("bookmarkList")!;
    this.emptyState = document.getElementById("emptyState")!;
    this.currentFolderTitle = document.getElementById("currentFolderTitle")!;
    this.bookmarkCount = document.getElementById("bookmarkCount")!;
    this.searchInput = document.getElementById(
      "searchInput",
    ) as HTMLInputElement;
    this.sortSelect = document.getElementById("sortBy") as HTMLSelectElement;
    this.viewToggle = document.getElementById(
      "viewToggle",
    ) as HTMLButtonElement;

    this.addBookmarkModal = document.getElementById("addBookmarkModal")!;
    this.addFolderModal = document.getElementById("addFolderModal")!;
    this.contextMenu = document.getElementById("contextMenu");

    this.init();
  }

  private async init() {
    // Initialize Lucide icons
    createIcons({ icons });

    await this.bookmarkManager.loadFromStorage();
    this.setupEventListeners();
    this.renderFolderTree();
    await this.renderBookmarks();
    this.updateUI();
  }

  private setupEventListeners() {
    // Header buttons
    document
      .getElementById("addBookmarkBtn")
      ?.addEventListener("click", () => this.showAddBookmarkModal());
    document
      .getElementById("addFolderBtn")
      ?.addEventListener("click", () => this.showAddFolderModal());
    document
      .getElementById("exportBtn")
      ?.addEventListener("click", () => this.exportBookmarks());
    document
      .getElementById("importBtn")
      ?.addEventListener("click", () => this.importBookmarks());
    document
      .getElementById("addFirstBookmarkBtn")
      ?.addEventListener("click", () => this.showAddBookmarkModal());

    // Search and filters
    this.searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderBookmarks();
    });

    this.sortSelect.addEventListener("change", (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as
        | "title"
        | "url"
        | "createdAt";
      this.renderBookmarks();
    });

    this.viewToggle.addEventListener("click", () => {
      this.isGridView = !this.isGridView;
      this.updateViewToggle();
      this.renderBookmarks();
    });

    // Modal handling
    this.setupModalEventListeners();

    // Context menu
    this.setupContextMenu();

    // Import file input
    document.getElementById("importInput")?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImportFile(file);
      }
    });
  }

  private setupModalEventListeners() {
    // Add bookmark modal
    document
      .getElementById("cancelAddBookmark")
      ?.addEventListener("click", () => this.hideAddBookmarkModal());
    document
      .getElementById("addBookmarkForm")
      ?.addEventListener("submit", (e) => this.handleAddBookmark(e));

    // Add folder modal
    document
      .getElementById("cancelAddFolder")
      ?.addEventListener("click", () => this.hideAddFolderModal());
    document
      .getElementById("addFolderForm")
      ?.addEventListener("submit", (e) => this.handleAddFolder(e));

    // Close modals on backdrop click
    this.addBookmarkModal.addEventListener("click", (e) => {
      if (e.target === this.addBookmarkModal) {
        this.hideAddBookmarkModal();
      }
    });

    this.addFolderModal.addEventListener("click", (e) => {
      if (e.target === this.addFolderModal) {
        this.hideAddFolderModal();
      }
    });
  }

  private setupContextMenu() {
    // Hide context menu on click outside
    document.addEventListener("click", () => {
      if (this.contextMenu) {
        this.contextMenu.classList.add("hidden");
      }
    });

    // Context menu actions
    this.contextMenu?.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = (e.target as HTMLElement)
        .closest("[data-action]")
        ?.getAttribute("data-action");
      if (action && this.contextTarget) {
        this.handleContextMenuAction(action, this.contextTarget);
      }
      this.contextMenu?.classList.add("hidden");
    });
  }

  private renderFolderTree() {
    const tree = this.bookmarkManager.buildTree();

    this.folderTree.innerHTML = `
            <div class="folder-item ${this.currentFolderId === "" ? "active" : ""}" data-folder-id="">
                <div class="folder-header" onclick="bookmarkUI.selectFolder('')">
                    <i data-lucide="bookmark" class="h-4 w-4"></i>
                    <span>All Bookmarks</span>
                    <span class="folder-count">${this.getTotalBookmarkCount()}</span>
                </div>
            </div>
        `;

    for (const treeNode of tree) {
      if (!("url" in treeNode.item)) {
        // It's a folder
        this.folderTree.appendChild(this.createFolderTreeNode(treeNode));
      }
    }

    // Re-initialize icons after DOM changes
    createIcons({ icons });
  }

  private createFolderTreeNode(treeNode: BookmarkTreeNode): HTMLElement {
    const folder = treeNode.item as BookmarkFolder;
    const folderElement = document.createElement("div");
    folderElement.className = `folder-item ${this.currentFolderId === folder.id ? "active" : ""}`;
    folderElement.dataset.folderId = folder.id;

    const hasChildren = treeNode.children && treeNode.children.length > 0;
    const isExpanded = true; // For now, keep all folders expanded

    folderElement.innerHTML = `
            <div class="folder-header" onclick="bookmarkUI.selectFolder('${folder.id}')">
                ${hasChildren ? `<i data-lucide="chevron-right" class="folder-toggle ${isExpanded ? "expanded" : ""}"></i>` : '<div class="w-4"></div>'}
                <i data-lucide="folder" class="h-4 w-4"></i>
                <span>${folder.title}</span>
                <span class="folder-count">${this.getTreeNodeCount(treeNode)}</span>
            </div>
        `;

    if (hasChildren && isExpanded) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-children";

      for (const child of treeNode.children!) {
        if (!("url" in child.item)) {
          // Only add folder children
          childrenContainer.appendChild(this.createFolderTreeNode(child));
        }
      }

      folderElement.appendChild(childrenContainer);
    }

    return folderElement;
  }

  private getTreeNodeCount(treeNode: BookmarkTreeNode): number {
    let count = 0;
    if (treeNode.children) {
      for (const child of treeNode.children) {
        if ("url" in child.item) {
          count++; // Count bookmarks
        } else {
          count += this.getTreeNodeCount(child); // Recursively count folder contents
        }
      }
    }
    return count;
  }

  private getTotalBookmarkCount(): number {
    return this.bookmarkManager.getBookmarks().length;
  }

  private async renderBookmarks() {
    let allBookmarks = this.bookmarkManager.getBookmarks();

    // Filter by current folder
    let bookmarks = allBookmarks.filter((b) =>
      this.currentFolderId === "" ? true : b.parentId === this.currentFolderId,
    );

    // Apply search filter
    if (this.searchQuery) {
      const searchItems = this.bookmarkManager.searchBookmarks(
        this.searchQuery,
      );
      const searchBookmarksIds = searchItems
        .filter((item) => "url" in item)
        .map((item) => item.id);

      bookmarks = bookmarks.filter((b) => searchBookmarksIds.includes(b.id));
    }

    // Sort bookmarks
    bookmarks.sort((a, b) => {
      switch (this.sortBy) {
        case "title":
          return (a?.title || "").localeCompare(b?.title || "");
        case "url":
          return (a?.url || "").localeCompare(b?.url || "");
        case "createdAt":
          const dateA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        default:
          return 0;
      }
    });

    // Update UI
    this.bookmarkCount.textContent = `${bookmarks.length} item${bookmarks.length !== 1 ? "s" : ""}`;

    if (bookmarks.length === 0) {
      this.bookmarkList.style.display = "none";
      this.emptyState.style.display = "flex";
    } else {
      this.bookmarkList.style.display = "block";
      this.emptyState.style.display = "none";

      // Apply view mode
      this.bookmarkList.className = this.isGridView
        ? "bookmark-grid"
        : "space-y-2";

      // Render bookmark items
      this.bookmarkList.innerHTML = "";
      for (const bookmark of bookmarks) {
        const bookmarkElement = await this.createBookmarkElement(bookmark);
        this.bookmarkList.appendChild(bookmarkElement);
      }
    }

    // Re-initialize icons after DOM changes
    createIcons({ icons });
  }

  private async createBookmarkElement(
    bookmark: Bookmark,
  ): Promise<HTMLElement> {
    const bookmarkElement = document.createElement("div");
    bookmarkElement.className = "bookmark-item";
    bookmarkElement.draggable = true;
    bookmarkElement.dataset.bookmarkId = bookmark.id;

    // Get favicon asynchronously
    const favicon = await this.getFavicon(bookmark.url);

    bookmarkElement.innerHTML = `
            <div class="favicon">
                ${favicon ? `<img src="${favicon}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ""}
                <i data-lucide="globe" class="h-4 w-4" style="${favicon ? "display: none;" : ""}"></i>
            </div>
            <div class="info">
                <span class="title">${this.highlightSearch(bookmark.title)}</span>
                <span class="url">${this.highlightSearch(bookmark.url)}</span>
            </div>
            <div class="actions">
                <button class="edit-bookmark-btn" data-bookmark-id="${bookmark.id}" title="Edit">
                    <i data-lucide="edit" class="h-4 w-4"></i>
                </button>
                <button class="delete-bookmark-btn" data-bookmark-id="${bookmark.id}" title="Delete">
                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
                <button class="open-bookmark-btn" data-bookmark-url="${bookmark.url}" title="Open">
                    <i data-lucide="external-link" class="h-4 w-4"></i>
                </button>
            </div>
        `;

    // Add event listeners
    bookmarkElement.addEventListener("contextmenu", (e) =>
      this.showContextMenu(e, bookmark),
    );
    bookmarkElement.addEventListener("dragstart", (e) =>
      this.handleDragStart(e, bookmark),
    );
    bookmarkElement.addEventListener("dragover", (e) => this.handleDragOver(e));
    bookmarkElement.addEventListener("drop", (e) =>
      this.handleDrop(e, bookmark),
    );

    // Add button event listeners
    const editBtn = bookmarkElement.querySelector(
      ".edit-bookmark-btn",
    ) as HTMLButtonElement;
    editBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.editBookmark(bookmark.id);
    });

    const deleteBtn = bookmarkElement.querySelector(
      ".delete-bookmark-btn",
    ) as HTMLButtonElement;
    deleteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteBookmark(bookmark.id);
    });

    const openBtn = bookmarkElement.querySelector(
      ".open-bookmark-btn",
    ) as HTMLButtonElement;
    openBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigateToBookmark(bookmark.url);
    });

    // Add click to navigate
    bookmarkElement.addEventListener("click", () => {
      this.navigateToBookmark(bookmark.url);
    });

    return bookmarkElement;
  }

  private async navigateToBookmark(url: string): Promise<void> {
    try {
      if (!url) {
        console.error("No URL provided for navigation");
        return;
      }

      if (url.startsWith("javascript:")) {
        const js = url.slice("javascript:".length);
        eval(js);
        return;
      }

      window.open(url, "_blank");
    } catch (error) {
      console.error("Failed to navigate to bookmark:", error);
      if (url) {
        window.open(url, "_blank");
      }
    }
  }

  private async getFavicon(url: string): Promise<string | null> {
    try {
      // First check if we have a cached favicon
      const cachedFavicon = this.bookmarkManager.getCachedFavicon(url);
      if (cachedFavicon) {
        return cachedFavicon;
      }

      // If not cached, fetch it (proxy will automatically cache it)
      const proxyFavicon = await this.proxy.getFavicon(url);
      return proxyFavicon;
    } catch (error) {
      console.warn("Failed to get favicon for", url, error);
      return null;
    }
  }

  private highlightSearch(text: string): string {
    if (!this.searchQuery) return text;

    const regex = new RegExp(`(${this.searchQuery})`, "gi");
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  private showContextMenu(e: MouseEvent, item: Bookmark | BookmarkFolder) {
    e.preventDefault();
    if (!this.contextMenu) return;

    this.contextTarget = item;
    this.contextMenu.style.left = `${e.pageX}px`;
    this.contextMenu.style.top = `${e.pageY}px`;
    this.contextMenu.classList.remove("hidden");
  }

  private handleContextMenuAction(
    action: string,
    item: Bookmark | BookmarkFolder,
  ) {
    switch (action) {
      case "edit":
        if ("url" in item) {
          this.editBookmark(item.id);
        }
        break;
      case "delete":
        if ("url" in item) {
          this.deleteBookmark(item.id);
        } else {
          this.deleteFolder(item.id);
        }
        break;
      case "copy":
        if ("url" in item) {
          navigator.clipboard.writeText(item.url);
        }
        break;
      case "open":
        if ("url" in item) {
          window.open(item.url, "_blank");
        }
        break;
    }
  }

  // Drag and Drop
  private handleDragStart(e: DragEvent, item: Bookmark | BookmarkFolder) {
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", JSON.stringify(item));
      e.dataTransfer.effectAllowed = "move";
    }
    (e.target as HTMLElement).classList.add("dragging");
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    (e.currentTarget as HTMLElement).classList.add("drag-over");
  }

  private async handleDrop(
    e: DragEvent,
    targetItem: Bookmark | BookmarkFolder,
  ) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("drag-over");

    const draggedData = e.dataTransfer?.getData("text/plain");
    if (!draggedData) return;

    try {
      const draggedItem = JSON.parse(draggedData);

      // Determine target folder
      const targetFolderId =
        "url" in targetItem ? targetItem.parentId : targetItem.id;

      // Move the item
      if ("url" in draggedItem) {
        await this.bookmarkManager.updateBookmark(draggedItem.id, {
          parentId: targetFolderId,
        });
      } else {
        await this.bookmarkManager.updateFolder(draggedItem.id, {
          parentId: targetFolderId,
        });
      }

      this.renderFolderTree();
      this.renderBookmarks();
    } catch (error) {
      console.error("Error handling drop:", error);
    }
  }

  // Public methods for UI interactions
  public selectFolder(folderId: string) {
    this.currentFolderId = folderId;

    // Update folder tree active state
    this.folderTree.querySelectorAll(".folder-item").forEach((item) => {
      item.classList.remove("active");
    });
    this.folderTree
      .querySelector(`[data-folder-id="${folderId}"]`)
      ?.classList.add("active");

    // Update title
    if (folderId === "") {
      this.currentFolderTitle.textContent = "All Bookmarks";
    } else {
      const folder = this.folderTree.querySelector(
        `[data-folder-id="${folderId}"] .folder-header span`,
      );
      this.currentFolderTitle.textContent =
        folder?.textContent || "Unknown Folder";
    }

    this.renderBookmarks();
  }

  public editBookmark(bookmarkId: string) {
    const bookmarks = this.bookmarkManager.getBookmarks();
    const bookmark = bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark) return;

    // Populate form with existing data
    (document.getElementById("bookmarkTitle") as HTMLInputElement).value =
      bookmark.title;
    (document.getElementById("bookmarkUrl") as HTMLInputElement).value =
      bookmark.url;
    (document.getElementById("bookmarkFolder") as HTMLSelectElement).value =
      bookmark.parentId || "";

    // Show modal
    this.showAddBookmarkModal();

    // Update form submit to handle edit
    const form = document.getElementById("addBookmarkForm");
    form?.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        await this.handleUpdateBookmark(bookmarkId);
      },
      { once: true },
    );
  }

  public async deleteBookmark(bookmarkId: string) {
    if (confirm("Are you sure you want to delete this bookmark?")) {
      await this.bookmarkManager.deleteBookmark(bookmarkId);
      this.renderFolderTree();
      this.renderBookmarks();
    }
  }

  public async deleteFolder(folderId: string) {
    if (
      confirm(
        "Are you sure you want to delete this folder and all its contents?",
      )
    ) {
      await this.bookmarkManager.deleteFolder(folderId);
      this.renderFolderTree();
      this.renderBookmarks();
    }
  }

  // Modal methods
  private showAddBookmarkModal() {
    this.populateFolderSelect("bookmarkFolder");
    this.addBookmarkModal.classList.remove("hidden");
    this.addBookmarkModal.classList.add("flex");
  }

  private hideAddBookmarkModal() {
    this.addBookmarkModal.classList.add("hidden");
    this.addBookmarkModal.classList.remove("flex");
    (document.getElementById("addBookmarkForm") as HTMLFormElement).reset();
  }

  private showAddFolderModal() {
    this.populateFolderSelect("parentFolder");
    this.addFolderModal.classList.remove("hidden");
    this.addFolderModal.classList.add("flex");
  }

  private hideAddFolderModal() {
    this.addFolderModal.classList.add("hidden");
    this.addFolderModal.classList.remove("flex");
    (document.getElementById("addFolderForm") as HTMLFormElement).reset();
  }

  private populateFolderSelect(selectId: string) {
    const select = document.getElementById(selectId) as HTMLSelectElement;
    const folders = this.bookmarkManager.getFolders();

    select.innerHTML = '<option value="">Root</option>';

    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.title;
      select.appendChild(option);
    }
  }

  private async handleAddBookmark(e: Event) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const title = (formData.get("bookmarkTitle") as string)?.trim();
    const url = (formData.get("bookmarkUrl") as string)?.trim();
    const parentId = formData.get("bookmarkFolder") as string;

    if (!title || !url) {
      alert("Title and URL are required");
      return;
    }

    await this.bookmarkManager.createBookmark({
      title,
      url,
      parentId: parentId || undefined,
    });

    this.hideAddBookmarkModal();
    this.renderFolderTree();
    this.renderBookmarks();
  }

  private async handleUpdateBookmark(bookmarkId: string) {
    const title = (
      document.getElementById("bookmarkTitle") as HTMLInputElement
    ).value?.trim();
    const url = (
      document.getElementById("bookmarkUrl") as HTMLInputElement
    ).value?.trim();
    const parentId = (
      document.getElementById("bookmarkFolder") as HTMLSelectElement
    ).value;

    if (!title || !url) {
      alert("Title and URL are required");
      return;
    }

    await this.bookmarkManager.updateBookmark(bookmarkId, {
      title,
      url,
      parentId: parentId || undefined,
    });

    this.hideAddBookmarkModal();
    this.renderFolderTree();
    this.renderBookmarks();
  }

  private async handleAddFolder(e: Event) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const title = formData.get("folderTitle") as string;
    const parentId = formData.get("parentFolder") as string;

    await this.bookmarkManager.createFolder({
      title,
      parentId: parentId || undefined,
    });

    this.hideAddFolderModal();
    this.renderFolderTree();
    this.renderBookmarks();
  }

  private updateViewToggle() {
    const icon = this.viewToggle.querySelector("i");
    if (icon) {
      icon.setAttribute("data-lucide", this.isGridView ? "list" : "grid");
      // Re-initialize icons after attribute change
      createIcons({ icons });
    }
  }

  private updateUI() {
    // Update any other UI elements as needed
  }

  // Import/Export
  private async exportBookmarks() {
    try {
      const bookmarks = this.bookmarkManager.getBookmarks();
      const folders = this.bookmarkManager.getFolders();
      const data = JSON.stringify({ bookmarks, folders }, null, 2);

      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `bookmarks-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export bookmarks");
    }
  }

  private importBookmarks() {
    document.getElementById("importInput")?.click();
  }

  private async handleImportFile(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Simple import - add all bookmarks and folders
      if (data.bookmarks) {
        for (const bookmark of data.bookmarks) {
          await this.bookmarkManager.createBookmark({
            title: bookmark.title,
            url: bookmark.url,
            parentId: bookmark.parentId,
          });
        }
      }

      if (data.folders) {
        for (const folder of data.folders) {
          await this.bookmarkManager.createFolder({
            title: folder.title,
            parentId: folder.parentId,
          });
        }
      }

      this.renderFolderTree();
      this.renderBookmarks();
      alert("Bookmarks imported successfully");
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to import bookmarks");
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize the bookmark manager
  const bookmarkUI = new BookmarkManagerUI();

  // Make it globally accessible for onclick handlers
  (window as any).bookmarkUI = bookmarkUI;
});
