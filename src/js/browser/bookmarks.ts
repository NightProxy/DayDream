class BookmarkManager {
  constructor(utils) {
    this.storageKey = "bookmarks";
    this.utils = utils;
    this.db = localforage.createInstance({
      name: "Bookmarks",
      storeName: "bookmarks",
    });
    (async () => {
      this.bookmarks = JSON.parse(await this.db.getItem(this.storageKey)) || [];
    })();
  }

  async save() {
    this.db.setItem(this.storageKey, JSON.stringify(this.bookmarks));
  }

  addBookmark(title, url, folder = null) {
    const newBookmark = {
      id: Date.now(),
      title,
      url,
      folder,
      dateAdded: new Date(),
    };
    this.bookmarks.push(newBookmark);
    this.save();
  }

  deleteBookmark(id) {
    this.bookmarks = this.bookmarks.filter((bm) => bm.id !== id);
    this.save();
  }

  renameBookmark(id, newTitle) {
    const bookmark = this.bookmarks.find((bm) => bm.id === id);
    if (bookmark) {
      bookmark.title = newTitle;
      this.save();
    }
  }

  renderBookmarks() {
    const container = document.querySelector("#bookmark-container");
    container.innerHTML = "";

    this.bookmarks.forEach((bm) => {
      const bmElement = this.createBookmarkElement(bm);
      container.appendChild(bmElement);
    });
  }

  createBookmarkElement(bookmark) {
    const bmElement = document.createElement("div");
    bmElement.className = `bookmark`;
    bmElement.textContent = bookmark.title;
    bmElement.dataset.id = bookmark.id;

    bmElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showContextMenu(e, bookmark);
    });

    bmElement.addEventListener("click", () => {
      if (bookmark.url.startsWith("javascript:")) {
        const bookmarklet = bookmark.url.replace("javascript:", "");
        document.querySelector("iframe.active").contentWindow.eval(bookmarklet);
      } else {
        this.utils.navigate(bookmark.url);
      }
    });

    return bmElement;
  }
}
