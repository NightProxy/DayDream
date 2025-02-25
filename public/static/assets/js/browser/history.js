
// THIS FILE CONTAINS A RAW DATA URI AND IS MORE THAN 30 KILOBYTES.
// DO NOT ATTEMPT TO READ ALL OF THE DATA URI.

// YOU HAVE BEEN WARNED.

class History {
  constructor(utils, proxy, swConfig, proxySetting) {
    this.storageKey = "history-file";
    this.utils = utils;
    this.db = localforage.createInstance({
      name: "History",
      storeName: "history-file",
    });
    (async () => {
      this.history = JSON.parse(await this.db.getItem(this.storageKey)) || [];
    })();
    this.defaultIcon = `/assets/imgs/default-page-icon.png`;
    (async () => {
      await proxy.setTransports();
    });
    this.proxy = proxy;
    this.swConfig = swConfig;
    this.proxySetting = proxySetting;

  } // most of functionality is borrowed from bookmarks.js

  async save() {
    this.db.setItem(this.storageKey, JSON.stringify(this.history));
  }

  async addEntry(doc_title, url) {
    const date = new Date();


    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });


    const currentTime = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });


    const monthId = (date.getMonth() + 1).toString().padStart(2, '0');
    const dayId = date.getDate().toString().padStart(2, '0');
    const yearId = date.getFullYear();
    const category = `${monthId}${dayId}${yearId}`;
    const elementId = Object.keys(this.history).length + 1
    console.log("Adding new entry with ID, ", elementId);
    const favicon = await proxy.getFavicon(url, this.swConfig, this.proxySetting) || this.defaultIcon;
    const historyEntry = {
      category: category,
      date: formattedDate,
      time: currentTime,
      doc_title: doc_title,
      url: url,
      favicon: favicon,
      id: elementId
    };

    this.history.push(historyEntry);
    this.save();
  }


  deleteHistoryEntry(id) {
    this.history = this.history.filter((historyEntry) => historyEntry.id !== id);
    this.save();
  }
  convertCategory(dateStr) {

    const month = parseInt(dateStr.substring(0, 2), 10);
    const day = parseInt(dateStr.substring(2, 4), 10);
    const year = parseInt(dateStr.substring(4), 10);


    const date = new Date(year, month - 1, day);


    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  createParent(category, parentElement) {
    let element = document.createElement("div")
    let day_title = document.createElement("h3")
    day_title.className = "day_title"
    day_title.textContent = this.convertCategory(category)
    let separator = document.createElement("hr")
    separator.className = 'separator'
    element.appendChild(day_title);
    element.appendChild(separator)
    return element

  }

  renderHistory(containerElement) {

    containerElement.innerHTML = "";

    daysToRender = []
    this.history.forEach((day) => {
      if (!day.category in daysToRender) {
        daysToRender.push(day.category)
      }

    })
    daysThatHaveBeenRendered = []
    this.history.reverse().forEach((entry) => {
      if (!entry.category in daysThatHaveBeenRendered) {
        const categoryParent = this.createParent(entry.category, containerElement)
        daysThatHaveBeenRendered.push(entry.category)
      }
      const categoryParent = document.getElementById(daysThatHaveBeenRendered[Object.keys(daysThatHaveBeenRendered).length - 1])
      const historyElement = this.createHistoryEntry(entry);
      categoryParent.appendChild(historyElement);




    });
  }

  createHistoryEntry(entry) {
    const historyElement = document.createElement("div");
    const favicon = document.createElement("img")
    favicon.src = entry.favicon;
    favicon.className = "history_favicon"
    const documentTitle = document.createElement("p")
    documentTitle.textContent = entry.doc_title;
    const hostname = document.createElement("p")
    hostname.className = "history_hostname";
    const urllol = new URL(hostname);
    let updatedHostname = urllol.hostname;


    if (!updatedHostname.startsWith('www.')) {
      updatedHostname = 'www.' + updatedHostname;
    }

    hostname.textContent = updatedHostname;

    historyElement.className = `history-entry`;

    historyElement.id = bookmark.id;


    historyElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showContextMenu(e, bookmark);
    });

    historyElement.addEventListener("click", () => {
      this.utils.navigate(bookmark.url);
    });

    return historyElement;
  }
}
