class Search {
  constructor(utils, proxy, prefix) {
    this.utils = utils;
    this.proxy = proxy;
    this.prefix = prefix;
    this.currentSectionIndex = 0;
    this.maxInitialResults = 4;
    this.maxExpandedResults = 8;
    this.appsData = [];
    this.sections = {}; // Define sections as a class property
  }

  init(searchbar) {
    const suggestionList = document.createElement("div");
    suggestionList.classList.add("suggestion-list");

    // Initialize sections and store them in the class property
    this.sections = {
      searchResults: this.createSection("Search Results"),
      otherPages: this.createSection("Other Pages"),
      settings: this.createSection("Settings"),
      games: this.createSection("Games"),
    };

    Object.values(this.sections).forEach(({ section }) =>
      suggestionList.appendChild(section),
    );

    searchbar.addEventListener("input", async (event) => {
      suggestionList.style.display = "flex";
      const query = event.target.value.trim();
      if (query === "" && event.key == "Backspace") {
        this.clearSuggestions();
        suggestionList.style.display = "none";
        return;
      }

      let cleanedQuery = query.replace(
        /^(daydream:\/\/|daydream:\/|daydream:)/,
        "",
      );
      const response = await fetch(`/results/${cleanedQuery}`).then((res) =>
        res.json(),
      );
      const suggestions = response.map((item) => item.phrase);

      this.clearSuggestions();

      await this.populateSections(suggestions, searchbar.value);
    });

    let selectedSuggestionIndex = -1;
    let currentMaxResults = this.maxInitialResults;

    window.addEventListener("keydown", (event) => {
      const suggestionItems = this.getCurrentSuggestionItems();
      const numSuggestions = suggestionItems.length;
      suggestionList.style.display = "flex";

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (selectedSuggestionIndex + 1 >= numSuggestions) {
          this.moveToNextSection(); // Move to next section when the last suggestion is selected
        } else {
          selectedSuggestionIndex =
            (selectedSuggestionIndex + 1) % numSuggestions;
        }
        this.updateSelectedSuggestion();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedSuggestionIndex =
          (selectedSuggestionIndex - 1 + numSuggestions) % numSuggestions;
        this.updateSelectedSuggestion();
      } else if (event.key === "Tab") {
        if (selectedSuggestionIndex !== -1) {
          event.preventDefault();
          const selectedSuggestion =
            suggestionItems[selectedSuggestionIndex].textContent;
          searchbar.value = selectedSuggestion;
        }
      } else if (event.key === "ArrowRight") {
        if (selectedSuggestionIndex !== -1) {
          event.preventDefault();
          const selectedSuggestion =
            suggestionItems[selectedSuggestionIndex].textContent;
          searchbar.value = selectedSuggestion;
        }
      } else if (event.key === "ArrowLeft") {
        if (currentMaxResults === this.maxExpandedResults) {
          event.preventDefault();
          this.moveToNextSection();
        }
      } else if (event.key == "Backspace") {
        suggestionList.style.display = "none";
        this.clearSuggestions();
      }

      suggestionList.querySelectorAll(".searchEngineIcon")[0].style.display =
        "block";
      switch (localStorage.getItem("search")) {
        case "https://duckduckgo.com/?q=%s":
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            "/assets/imgs/b/ddg.webp";
          suggestionList.querySelectorAll(
            ".searchEngineIcon",
          )[0].style.transform = "scale(1.35)";
          break;
        case "https://bing.com/search?q=%s":
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            "/assets/imgs/b/bing.webp";
          suggestionList.querySelectorAll(
            ".searchEngineIcon",
          )[0].style.transform = "scale(1.65)";
          break;
        case "https://www.google.com/search?q=%s":
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            "/assets/imgs/b/google.webp";
          suggestionList.querySelectorAll(
            ".searchEngineIcon",
          )[0].style.transform = "scale(1.2)";
          break;
        case "https://search.yahoo.com/search?p=%s":
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            "/assets/imgs/b/yahoo.webp";
          suggestionList.querySelectorAll(
            ".searchEngineIcon",
          )[0].style.transform = "scale(1.5)";
          break;
        default:
          this.utils
            .getFavicon(localStorage.getItem("search"))
            .then((dataUrl) => {
              if (dataUrl == null || dataUrl.endsWith("null")) {
                suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
                  "/assets/imgs/b/google.webp";
                suggestionList.querySelectorAll(
                  ".searchEngineIcon",
                )[0].style.transform = "scale(1.2)";
              } else {
                suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
                  dataUrl;
                suggestionList.querySelectorAll(
                  ".searchEngineIcon",
                )[0].style.transform = "scale(1.2)";
              }
            });
      }
    });

    document.body.appendChild(suggestionList);
  }

  createSection(titleText) {
    const section = document.createElement("div");
    section.classList.add("search-section");

    const searchTitle = document.createElement("div");
    searchTitle.classList.add("search-title");

    const icon = document.createElement("img");
    icon.classList.add("searchEngineIcon");
    icon.src = "/assets/imgs/logo.png";

    const title = document.createElement("span");
    title.textContent = titleText;

    searchTitle.appendChild(icon);
    searchTitle.appendChild(title);

    const searchResults = document.createElement("div");
    searchResults.classList.add("search-results");

    section.appendChild(searchTitle);
    section.appendChild(searchResults);

    return { section, searchResults };
  }

  getCurrentSuggestionItems() {
    return Object.values(this.sections)[
      this.currentSectionIndex
    ].searchResults.querySelectorAll("div");
  }

  moveToNextSection() {
    this.currentSectionIndex =
      (this.currentSectionIndex + 1) % Object.values(this.sections).length;
    while (
      Object.values(this.sections)[this.currentSectionIndex].searchResults
        .children.length === 0
    ) {
      this.currentSectionIndex =
        (this.currentSectionIndex + 1) % Object.values(this.sections).length;
    }
    this.selectedSuggestionIndex = -1;
    this.currentMaxResults = this.maxInitialResults;
    this.updateSelectedSuggestion();
  }

  updateSelectedSuggestion() {
    const suggestionItems = this.getCurrentSuggestionItems();
    suggestionItems.forEach((item, index) => {
      item.classList.toggle("selected", index === this.selectedSuggestionIndex);
    });
  }

  async generatePredictedUrls(query) {
    try {
      const response = await fetch(`/results/${query}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      return data.map((item) => item.phrase);
    } catch (error) {
      console.error("Error fetching predicted URLs:", error);
      return [];
    }
  }

  clearSuggestions() {
    Object.values(this.sections).forEach(({ searchResults }) => {
      searchResults.innerHTML = "";
      searchResults.parentElement.style.display = "none";
    });
  }

  async populateSections(suggestions, e) {
    const searchResultsSuggestions = suggestions.slice(
      0,
      this.maxExpandedResults,
    );
    this.populateSearchResults(searchResultsSuggestions);

    await this.populateOtherPages(suggestions);

//    await this.populateSettings(suggestions);

    await this.populateGames(e);
  }

  populateSearchResults(suggestions) {
    const { searchResults, section } = this.sections.searchResults;
    if (suggestions.length > 0) {
      section.style.display = "block";
      suggestions.forEach((suggestion) => {
        const listItem = this.createSuggestionItem(suggestion);
        searchResults.appendChild(listItem);
      });
    }
  }

  async populateOtherPages(query) {
    const { searchResults, section } = this.sections.otherPages;
    let hasResults = false;

    console.log("Query:", query);
    for (let url of query) {
      url = url.replace(/ /g, "");
      url = "daydream://" + url;
      const internalUrl = this.utils.processUrl(url);
      const response = await fetch(internalUrl, { method: "HEAD" });

      if (response.ok) {
        const listItem = this.createSuggestionItem(url);
        searchResults.appendChild(listItem);
        hasResults = true;
      }
    }
    section.style.display = hasResults ? "block" : "none";
  }

  async populateSettings() {
    const { searchResults, section } = this.sections.settings;
    let hasResults = false;

    let query = searchbar.value;
    query = query.replace(/^(daydream:\/\/|daydream:\/|daydream:)/, "");

    const predictedUrls = this.generatePredictedSettingsUrls(query);
    for (let url of predictedUrls) {
      const response = await fetch(url, { method: "HEAD" });

      if (response.ok) {
        const listItem = this.createSuggestionItem(url);
        searchResults.appendChild(listItem);
        hasResults = true;
      } else if (!response.ok) {
        return null;
      }
    }

    section.style.display = hasResults ? "block" : "none";
  }

  generatePredictedSettingsUrls(query) {
    const basePaths = [
      "settings",
      "settings/about",
      "settings/profile",
      "settings/privacy",
      "settings/security",
      "settings/notifications",
    ];
    query = query.replace(/ /g, "");
    return basePaths.map((base) => `${base}${query ? `/${query}` : ""}`);
  }

  async populateGames(query) {
    const { searchResults, section } = this.sections.games;
    let hasResults = false;

    if (this.appsData.length === 0) {
      await this.fetchAppData();
    }

    const lowerQuery = query.toLowerCase()
    const filteredGames = this.appsData
      .filter((app) => app.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10);

    if (filteredGames.length > 0) {
      section.style.display = "block";
      filteredGames.forEach((game) => {
        const listItem = this.createGameItem(game);
        searchResults.appendChild(listItem);
        hasResults = true;
      });
    }

    section.style.display = hasResults ? "block" : "none";
  }

  async fetchAppData() {
    try {
      const response = await fetch("/assets/json/g.json");
      this.appsData = await response.json(); // Use this.appsData
    } catch (error) {
      console.error("Error fetching JSON data:", error);
    }
  }

  createSuggestionItem(suggestion) {
    const listItem = document.createElement("div");
    const listIcon = document.createElement("span");
    listIcon.classList.add("material-symbols-outlined");
    listIcon.textContent = "search";
    listItem.appendChild(listIcon);
    listItem.innerHTML += suggestion;
    listItem.addEventListener("click", () => {
      searchbar.value = suggestion;
      this.clearSuggestions();
      if (suggestion.startsWith("daydream")) {
        const link = this.utils.processUrl(suggestion);
        if (link.startsWith("/internal/")) {
          this.utils.navigate(suggestion);
        }
      } else {
        this.utils.navigate(
          this.prefix + this.proxy.crypts.encode(this.proxy.search(suggestion)),
        );
      }
      suggestionList.style.display = "none";
    });
    return listItem;
  }

  createGameItem(game) {
    const listItem = document.createElement("div");
    const listIcon = document.createElement("img");
    listIcon.classList.add("game-icon");
    listIcon.src = game.image;
    listItem.appendChild(listIcon);
    listItem.innerHTML += game.name;
    listItem.addEventListener("click", () => {
      searchbar.value = game.link;
      this.clearSuggestions();
      if (game.link.startsWith("daydream")) {
        const link = this.utils.processUrl(game.link);
        if (link.startsWith("/internal/")) {
          this.utils.navigate(game.link);
        }
      } else {
        this.utils.navigate(
          this.prefix + this.proxy.crypts.encode(this.proxy.search(game.link)),
        );
      }
      suggestionList.style.display = "none";
    });

    return listItem;
  }
}
