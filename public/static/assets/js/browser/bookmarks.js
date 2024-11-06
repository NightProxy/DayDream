class BookmarkManager {
     constructor(storageKey = 'bookmarks', settings) {
        this.storageKey = storageKey;
        this.settings = settings;
        this.bookmarks = JSON.parse(this.settings.getItem(this.storageKey)) || [];
        this.currentView = 'list'; // 'list' or 'row'
    }

    async save() {
        this.settings.setItem(this.storageKey, JSON.stringify(this.bookmarks));
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

    renderBookmarks(viewType = this.currentView) {
        this.currentView = viewType;
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
        bmElement.className = `bookmark ${this.currentView}`;
        bmElement.textContent = bookmark.title;
        bmElement.dataset.id = bookmark.id;

        // Right-click context menu
        bmElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, bookmark);
        });

        bmElement.addEventListener('click', () => {
            if (bookmark.url.startsWith('javascript:')) {
                //execute js in iframe here
            } else {
                 // Open URL in new tab
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

        // Additional actions: move to folder, etc.
    }

    createFolder(folderName) {
        if (!this.bookmarks.some(bm => bm.folder === folderName)) {
            this.bookmarks.push({ id: Date.now(), title: folderName, folder: folderName });
            this.save();
        }
    }

    importBookmarks(jsonData) {
        try {
            const importedBookmarks = JSON.parse(jsonData);
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

    toggleView(viewType) {
        this.currentView = viewType;
        this.renderBookmarks(viewType);
    }
}
