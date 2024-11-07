class BookmarkManager {
    constructor(utils) {
        this.storageKey = 'bookmarks';
        this.utils = utils;
        this.db = localStorage.createInstance({
            name: 'Bookmarks',
            storeName: 'bookmarks',
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
        this.bookmarks = this.bookmarks.filter(bm => bm.id !== id);
        this.save();
    }

    renameBookmark(id, newTitle) {
        const bookmark = this.bookmarks.find(bm => bm.id === id);
        if (bookmark) {
            bookmark.title = newTitle;
            this.save();
        }
    }

    moveBookmark(id, folder) {
        const bookmark = this.bookmarks.find(bm => bm.id === id);
        if (bookmark) {
            bookmark.folder = folder;
            this.save();
        }
    }

    renderBookmarks() {
        const container = document.querySelector('#bookmark-container');
        container.innerHTML = '';

        this.bookmarks.forEach(bm => {
            if (!bm.folder) {
                const bmElement = this.createBookmarkElement(bm);
                container.appendChild(bmElement);
            }
        });
    }

    createBookmarkElement(bookmark) {
        const bmElement = document.createElement('div');
        bmElement.className = `bookmark`;
        bmElement.textContent = bookmark.title;
        bmElement.dataset.id = bookmark.id;

        bmElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, bookmark);
        });

        bmElement.addEventListener('click', () => {
            if (bookmark.url.startsWith('javascript:')) {
               const bookmarklet = bookmark.url.replace('javascript:', '');
                document.querySelector("iframe.active").contentWindow.eval(bookmarklet);
            } else {
                this.utils.navigate(bookmark.url);
            }
        });

        return bmElement;
    }

    showContextMenu(event, bookmark) {
        const contextMenu = document.querySelector('#context-menu');
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.classList.add('visible');

        document.querySelector('#delete-bookmark').onclick = () => {
            this.deleteBookmark(bookmark.id);
            this.renderBookmarks();
            contextMenu.classList.remove('visible');
        };

        document.querySelector('#rename-bookmark').onclick = () => {
            const newTitle = prompt('Enter new title:', bookmark.title);
            if (newTitle) {
                this.renameBookmark(bookmark.id, newTitle);
                this.renderBookmarks();
            }
            contextMenu.classList.remove('visible');
        };

        // Reminder: add more actions like move to folder, etc.
    }

    createFolder(folderName) {
        if (!this.bookmarks.some(bm => bm.folder === folderName)) {
            this.bookmarks.push({ id: Date.now(), title: folderName, folder: folderName });
            this.save();
        }
    }

    importBookmarks(jsonData) {
        try {
            const importedBookmarks = JSON.parse(decodeURIComponent(jsonData));
            this.bookmarks = [...this.bookmarks, ...importedBookmarks];
            this.save();
            this.renderBookmarks();
        } catch (e) {
            alert('Invalid import format');
        }
    }

    exportBookmarks() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.bookmarks));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "bookmarks.daydream");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

}
