import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Protocols } from "@browser/protocols";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { Proxy } from "@apis/proxy";

interface Section {
  section: HTMLElement;
  searchResults: HTMLElement;
}

interface GameData {
  name: string;
  image: string;
  link: string;
}

interface SearchInterface {
  proto: Protocols;
  ui: UI;
  data: Logger;
  settings: SettingsAPI;
  proxy: Proxy;
  swConfig: any;
  proxySetting: string;
  currentSectionIndex: number;
  maxInitialResults: number;
  maxExpandedResults: number;
  appsData: GameData[];
  sections: Record<string, Section>;
  selectedSuggestionIndex: number;
  currentMaxResults: number;
}

class Search implements SearchInterface {
  proto: Protocols;
  ui: UI;
  data: Logger;
  settings: SettingsAPI;
  proxy: Proxy;
  swConfig: any;
  proxySetting: string;
  currentSectionIndex: number;
  maxInitialResults: number;
  maxExpandedResults: number;
  appsData: GameData[];
  sections: Record<string, Section>;
  selectedSuggestionIndex: number;
  currentMaxResults: number;
  searchbar: HTMLInputElement | null = null;
  private lastQuery: string = "";
  private readonly DOMAIN_REGEX =
    /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/.*)?$/;
  private internalPagesList: Array<{ name: string; url: string; keywords: string[] }> = [];

  private async loadInternalPages(): Promise<void> {
    if (this.internalPagesList.length > 0) return;

    const INTERNAL_PAGES_MAP: Record<string, { name: string; keywords: string[] }> = {
      bookmarks: { name: "Bookmarks", keywords: ["bookmarks", "favorites", "saved"] },
      error: { name: "Error", keywords: ["error", "404", "not found"] },
      extensions: { name: "Extensions", keywords: ["extensions", "addons", "plugins"] },
      games: { name: "Games", keywords: ["games", "play", "entertainment"] },
      history: { name: "History", keywords: ["history", "visited", "past"] },
      newtab: { name: "New Tab", keywords: ["newtab", "home", "start"] },
      privacy: { name: "Privacy", keywords: ["privacy", "policy", "terms"] },
      settings: { name: "Settings", keywords: ["settings", "config", "preferences"] },
      terms: { name: "Terms", keywords: ["terms", "service", "legal"] },
      updates: { name: "Updates", keywords: ["updates", "changelog", "news", "whats new"] },
    };

    for (const [path, meta] of Object.entries(INTERNAL_PAGES_MAP)) {
      try {
        const response = await fetch(`/internal/${path}/index.html`, { method: "HEAD" });
        if (response.ok) {
          this.internalPagesList.push({
            name: meta.name,
            url: `ddx://${path}`,
            keywords: meta.keywords,
          });
        }
      } catch {
        continue;
      }
    }
  }

  constructor(
    proxy: Proxy,
    swConfig: any,
    proxySetting: string,
    proto: Protocols,
  ) {
    this.proto = proto;
    this.ui = new UI();
    this.data = new Logger();
    this.settings = new SettingsAPI();
    this.proxy = proxy;
    this.swConfig = swConfig;
    this.proxySetting = proxySetting;
    this.currentSectionIndex = 0;
    this.maxInitialResults = 4;
    this.maxExpandedResults = 8;
    this.appsData = [];
    this.sections = {};
    this.selectedSuggestionIndex = -1;
    this.currentMaxResults = this.maxInitialResults;
  }

  async init(searchbar: HTMLInputElement) {
    this.searchbar = searchbar;

    const suggestionList = this.ui.createElement("div", {
      class:
        "suggestion-list fixed z-[9999] left-1/2 transform w-full max-w-2xl bg-[var(--bg-2)] rounded-xl shadow-lg border border-[var(--main-35a)] backdrop-blur-sm",
      id: "suggestion-list",
      style:
        "top: 30%; transform: translate(-50%, -50%); min-height: 20vh; max-height: 40vh; overflow-y: auto; display: none;",
    });

    this.sections = {
      searchResults: this.createSection("Search Results", "search"),
      internalPages: this.createSection("Internal Pages", "folder"),
      games: this.createSection("Games", "gamepad-2"),
    };

    Object.values(this.sections).forEach((sectionObj: Section) =>
      suggestionList.appendChild(sectionObj.section),
    );

    let debounceTimer: number | null = null;
    searchbar.addEventListener("input", async (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;

      const query = target.value.trim();
      const inputEvent = event as InputEvent;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      if (query === "" && inputEvent.inputType === "deleteContentBackward") {
        this.clearSuggestions();
        suggestionList.style.display = "none";
        return;
      }

      if (query.length > 0) {
        suggestionList.style.display = "block";
      }

      debounceTimer = window.setTimeout(async () => {
        await this.performSearch(query);
      }, 150);
    });

    window.addEventListener("keydown", async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        suggestionList.style.display = "none";
        this.clearSuggestions();
        searchbar.blur();
        return;
      }

      const suggestionItems = this.getCurrentSuggestionItems();
      const numSuggestions = suggestionItems.length;

      if (
        numSuggestions > 0 &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)
        return;

      if (numSuggestions === 0) return;

      suggestionList.style.display = "block";

      if (event.key === "ArrowDown") {
        if (this.selectedSuggestionIndex + 1 >= numSuggestions) {
          this.moveToNextSection();
          this.selectedSuggestionIndex = 0;
        } else {
          this.selectedSuggestionIndex =
            (this.selectedSuggestionIndex + 1) % numSuggestions;
        }
        this.updateSelectedSuggestion();
      } else if (event.key === "ArrowUp") {
        if (this.selectedSuggestionIndex === 0) {
          this.moveToPreviousSection();
        } else {
          this.selectedSuggestionIndex =
            (this.selectedSuggestionIndex - 1 + numSuggestions) %
            numSuggestions;
        }
        this.updateSelectedSuggestion();
      } else if (event.key === "Tab" || event.key === "ArrowRight") {
        if (this.selectedSuggestionIndex !== -1) {
          event.preventDefault();
          const selectedSuggestion =
            suggestionItems[this.selectedSuggestionIndex].querySelector(
              ".suggestion-text",
            )?.textContent;
          if (selectedSuggestion) {
            searchbar.value = selectedSuggestion;
          }
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (this.selectedSuggestionIndex !== -1) {
          const selectedItem = suggestionItems[this.selectedSuggestionIndex];
          selectedItem.click();
        } else {
          suggestionList.style.display = "none";
          this.clearSuggestions();
          if (searchbar.value.trim()) {
            await this.handleDirectNavigation(searchbar.value.trim());
          }
        }
      } else if (event.key === "Backspace") {
        if (searchbar.value === "") {
          suggestionList.style.display = "none";
          this.clearSuggestions();
        }
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target as Node;
      if (
        !suggestionList.contains(target) &&
        target !== searchbar &&
        !searchbar.contains(target)
      ) {
        this.clearSuggestions();
        suggestionList.style.display = "none";
      }
    });

    searchbar.addEventListener("blur", () => {
      setTimeout(() => {
        if (
          document.activeElement !== searchbar &&
          !suggestionList.contains(document.activeElement as Node)
        ) {
          this.clearSuggestions();
          suggestionList.style.display = "none";
        }
      }, 150);
    });

    searchbar.addEventListener("focus", () => {
      if (searchbar.value.trim().length > 0) {
        suggestionList.style.display = "block";
      }
    });

    document.body.appendChild(suggestionList);

    const activeIframe = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement | null;
    if (activeIframe) {
      activeIframe.addEventListener("load", async () => {
        await this.syncAddressBar(activeIframe, searchbar);
      });
    }
  }

  createSection(titleText: string, iconName?: string): Section {
    const section = this.ui.createElement(
      "div",
      {
        class:
          "search-section p-4 border-b border-[var(--main-20a)] last:border-b-0",
        style: "display: none;",
      },
      [
        this.ui.createElement(
          "div",
          {
            class:
              "search-title flex items-center gap-2 mb-3 text-sm font-medium text-[var(--main)] uppercase tracking-wide",
          },
          [
            this.ui.createElement("i", {
              "data-lucide": iconName || "search",
              class: "w-4 h-4 text-[var(--main)]",
            }),
            this.ui.createElement("span", {}, [titleText]),
          ],
        ),
        this.ui.createElement("div", { class: "search-results space-y-1" }),
      ],
    );

    const searchResults = section.querySelector(
      ".search-results",
    ) as HTMLElement;
    return { section, searchResults };
  }

  getCurrentSuggestionItems(): NodeListOf<HTMLDivElement> {
    return Object.values(this.sections)[
      this.currentSectionIndex
    ].searchResults.querySelectorAll(":scope > div");
  }

  moveToPreviousSection(): void {
    const sectionsArray = Object.values(this.sections);
    this.currentSectionIndex =
      (this.currentSectionIndex - 1 + sectionsArray.length) %
      sectionsArray.length;
    while (
      sectionsArray[this.currentSectionIndex].searchResults.children.length ===
      0
    ) {
      this.currentSectionIndex =
        (this.currentSectionIndex - 1 + sectionsArray.length) %
        sectionsArray.length;
    }
    const previousSectionItems = this.getCurrentSuggestionItems();
    this.selectedSuggestionIndex = previousSectionItems.length - 1;
    this.updateSelectedSuggestion();
  }

  moveToNextSection(): void {
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
    this.updateSelectedSuggestion();
  }

  updateSelectedSuggestion(): void {
    const suggestionItems = this.getCurrentSuggestionItems();
    document
      .querySelectorAll(".search-results div.selected")
      .forEach((item) => {
        item.classList.remove(
          "selected",
          "bg-[var(--main-35a)]",
          "border-l-[var(--main)]",
        );
      });
    suggestionItems.forEach((item, index) => {
      if (index === this.selectedSuggestionIndex) {
        item.classList.add(
          "selected",
          "bg-[var(--main-35a)]",
          "border-l-[var(--main)]",
        );
        const parent = item.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();

          if (itemRect.top < parentRect.top) {
            parent.scrollTop -= parentRect.top - itemRect.top;
          } else if (itemRect.bottom > parentRect.bottom) {
            parent.scrollTop += itemRect.bottom - parentRect.bottom;
          }
        }
      } else {
        item.classList.remove(
          "selected",
          "bg-[var(--main-35a)]",
          "border-l-[var(--main)]",
        );
      }
    });
  }

  private async performSearch(query: string): Promise<void> {
    if (!query || query === this.lastQuery) return;

    this.lastQuery = query;
    this.clearSuggestions();

    try {
      const cleanedQuery = query.replace(/^(ddx:\/\/|ddx:\/|ddx:)/, "");
      const suggestions = await this.fetchSearchSuggestions(cleanedQuery);

      if (this.isValidUrl(query) && !suggestions.includes(query)) {
        suggestions.unshift(query);
      }

      await this.populateSearchResults(suggestions);

      await this.populateInternalPages(query);
      await this.populateGames(query);

      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    } catch (error) {
      console.error("Search error:", error);
      this.data.createLog(`Search error: ${error}`);
    }
  }

  private isValidUrl(input: string): boolean {
    if (
      window.protocols?.isRegisteredProtocol(input) ||
      input.startsWith("http://") ||
      input.startsWith("https://")
    ) {
      return true;
    }

    return (
      this.DOMAIN_REGEX.test(input) ||
      (input.includes(".") && !input.includes(" "))
    );
  }

  private async fetchSearchSuggestions(query: string): Promise<string[]> {
    try {
      const response = await fetch(`/api/results/${encodeURIComponent(query)}`);
      if (!response.ok) return [];

      const data = await response.json();
      return data
        .map((item: any) => item.phrase)
        .slice(0, this.maxExpandedResults);
    } catch (error) {
      console.warn("Failed to fetch search suggestions:", error);
      return [];
    }
  }

  private async syncAddressBar(
    iframe: HTMLIFrameElement,
    searchbar: HTMLInputElement,
  ): Promise<void> {
    try {
      let url = new URL(iframe.src).pathname;

      const internalCheck = await this.proto.getInternalURL(url);
      if (
        typeof internalCheck === "string" &&
        this.proto.isRegisteredProtocol(internalCheck)
      ) {
        searchbar.value = internalCheck;
        return;
      }

      const windowObj = window as any;
      const proxyConfig = windowObj.SWconfig?.[windowObj.ProxySettings];

      if (proxyConfig?.config?.prefix) {
        url = url.replace(proxyConfig.config.prefix, "");
      }

      let decodedUrl = url;
      if (windowObj.__uv$config?.decodeUrl) {
        try {
          decodedUrl = windowObj.__uv$config.decodeUrl(url);
        } catch {
          decodedUrl = iframe.src;
        }
      }

      const decodedCheck = await this.proto.getInternalURL(decodedUrl);

      if (
        typeof decodedCheck === "string" &&
        this.proto.isRegisteredProtocol(decodedCheck)
      ) {
        searchbar.value = decodedCheck;
      } else {
        try {
          const urlObj = new URL(decodedUrl);
          searchbar.value = urlObj.href;
        } catch {
          searchbar.value = decodedUrl;
        }
      }
    } catch (error) {
      console.warn("Failed to sync address bar:", error);
      this.data.createLog(`Address bar sync error: ${error}`);
    }
  }

  async generatePredictedUrls(query: string): Promise<string[]> {
    try {
      const response = await fetch(`/api/results/${query}`);
      if (!response || !response.ok)
        throw new Error("Network response was not ok");
      const data = await response.json();
      return data.map((item: any) => item.phrase);
    } catch (error) {
      console.error("Error fetching predicted URLs:", error);
      return [];
    }
  }

  clearSuggestions(): void {
    Object.values(this.sections).forEach(({ searchResults, section }) => {
      searchResults.innerHTML = "";
      section.style.display = "none";
    });
    this.selectedSuggestionIndex = -1;
    this.currentSectionIndex = 0;
  }

  async populateSections(suggestions: string[], e: string): Promise<void> {
    const searchResultsSuggestions = suggestions.slice(
      0,
      this.maxExpandedResults,
    );
    this.populateSearchResults(searchResultsSuggestions);
    await this.populateInternalPages(e);
    await this.populateGames(e);
  }

  populateSearchResults(suggestions: string[]): void {
    const { searchResults, section } = this.sections.searchResults;
    if (suggestions.length > 0) {
      section.style.display = "block";
      suggestions.forEach((suggestion: string) => {
        const listItem = this.createSuggestionItem(suggestion, "search");
        searchResults.appendChild(listItem);
      });
    } else {
      section.style.display = "none";
    }
  }

  async populateInternalPages(query: string): Promise<void> {
    const { searchResults, section } = this.sections.internalPages;
    let hasResults = false;

    await this.loadInternalPages();

    const lowerQuery = query.toLowerCase();
    const filteredPages = this.internalPagesList
      .filter(
        (page) =>
          page.name.toLowerCase().includes(lowerQuery) ||
          page.keywords.some((keyword) => keyword.includes(lowerQuery)) ||
          page.url.includes(lowerQuery),
      )
      .slice(0, 5);

    if (filteredPages.length > 0) {
      section.style.display = "block";
      filteredPages.forEach((page) => {
        const listItem = this.createSuggestionItem(
          page.url,
          "folder",
          page.name,
        );
        searchResults.appendChild(listItem);
        hasResults = true;
      });
    }

    if (!hasResults) {
      section.style.display = "none";
    }
  }

  async populateSettings(searchbar: HTMLInputElement): Promise<void> {
    const { searchResults, section } = this.sections.settings;
    let hasResults = false;
    let query = searchbar.value;
    query = query.replace(/^(ddx:\/\/|ddx:\/|ddx:)/, "");
    const predictedUrls = this.generatePredictedSettingsUrls(query);
    for (let url of predictedUrls) {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        const listItem = this.createSuggestionItem(url);
        searchResults.appendChild(listItem);
        hasResults = true;
      } else if (!response.ok) {
        return;
      }
    }
    section.style.display = hasResults ? "block" : "none";
  }

  generatePredictedSettingsUrls(query: string): string[] {
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

  async populateGames(query: string): Promise<void> {
    const { searchResults, section } = this.sections.games;
    let hasResults = false;

    if (this.appsData.length === 0) {
      await this.fetchAppData();
    }

    if (query.trim() === "") {
      section.style.display = "none";
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filteredGames = this.appsData
      .filter((app) => app.name.toLowerCase().includes(lowerQuery))
      .slice(0, 6);

    if (filteredGames.length > 0) {
      section.style.display = "block";
      filteredGames.forEach((game: GameData) => {
        const listItem = this.createGameItem(game);
        searchResults.appendChild(listItem);
        hasResults = true;
      });
    }

    if (!hasResults) {
      section.style.display = "none";
    }
  }

  createSuggestionItem(
    suggestion: string,
    iconName?: string,
    displayName?: string,
  ): HTMLElement {
    const listItem = this.ui.createElement(
      "div",
      {
        class:
          "flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--main-20a)] hover:border-l-2 hover:border-l-[var(--main)] cursor-pointer transition-all group border-l-2 border-l-transparent",
        tabindex: "-1",
      },
      [
        this.ui.createElement("i", {
          "data-lucide":
            iconName ||
            (this.isValidUrl(suggestion) ? "external-link" : "search"),
          class:
            "w-4 h-4 text-[var(--proto)] group-hover:text-[var(--main)] transition-colors flex-shrink-0",
        }),
        this.ui.createElement(
          "div",
          {
            class: "flex-1 min-w-0",
          },
          [
            this.ui.createElement(
              "div",
              {
                class:
                  "suggestion-text text-sm text-[var(--text)] truncate group-hover:text-[var(--text)]",
              },
              [displayName || suggestion],
            ),
            ...(displayName && displayName !== suggestion
              ? [
                  this.ui.createElement(
                    "div",
                    {
                      class:
                        "text-xs text-[var(--proto)] truncate mt-1 group-hover:text-[var(--main-70)]",
                    },
                    [suggestion],
                  ),
                ]
              : []),
          ],
        ),
      ],
    );

    listItem.addEventListener("click", async () => {
      await this.handleSuggestionClick(suggestion);
    });

    return listItem;
  }

  createGameItem(game: GameData): HTMLElement {
    const listItem = this.ui.createElement(
      "div",
      {
        class:
          "flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--main-20a)] hover:border-l-2 hover:border-l-[var(--main)] cursor-pointer transition-all group border-l-2 border-l-transparent",
        tabindex: "-1",
      },
      [
        this.ui.createElement(
          "div",
          {
            class:
              "w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-[var(--bg-1)] ring-1 ring-[var(--main-35a)]",
          },
          [
            this.ui.createElement("img", {
              src: game.image,
              alt: game.name,
              class: "w-full h-full object-cover",
              loading: "lazy",
            }),
          ],
        ),
        this.ui.createElement(
          "div",
          {
            class: "flex-1 min-w-0",
          },
          [
            this.ui.createElement(
              "div",
              {
                class:
                  "text-sm text-[var(--text)] font-medium truncate group-hover:text-[var(--text)]",
              },
              [game.name],
            ),
            this.ui.createElement(
              "div",
              {
                class:
                  "text-xs text-[var(--proto)] truncate group-hover:text-[var(--main-70)]",
              },
              ["Game"],
            ),
          ],
        ),
        this.ui.createElement("i", {
          "data-lucide": "gamepad-2",
          class:
            "w-4 h-4 text-[var(--proto)] group-hover:text-[var(--main)] transition-colors flex-shrink-0",
        }),
      ],
    );

    listItem.addEventListener("click", async () => {
      await this.handleGameClick(game);
    });

    return listItem;
  }

  private async handleSuggestionClick(suggestion: string): Promise<void> {
    this.clearSuggestions();
    const suggestionListElem = document.querySelector(
      "#suggestion-list",
    ) as HTMLElement | null;
    if (suggestionListElem) {
      suggestionListElem.style.display = "none";
    }

    try {
      if (this.proto.isRegisteredProtocol(suggestion)) {
        const processedUrl = await this.proto.processUrl(suggestion);
        if (
          typeof processedUrl === "string" &&
          processedUrl.startsWith("/internal/")
        ) {
          const iframe = document.querySelector(
            "iframe.active",
          ) as HTMLIFrameElement | null;
          if (iframe) {
            iframe.setAttribute("src", processedUrl);
          }
        }
      } else {
        await this.proxy.redirect(this.swConfig, this.proxySetting, suggestion);
      }
    } catch (error) {
      console.error("Navigation error:", error);
      this.data.createLog(`Navigation error: ${error}`);
    }
  }

  private async handleDirectNavigation(input: string): Promise<void> {
    try {
      if (this.proto.isRegisteredProtocol(input)) {
        const processedUrl = await this.proto.processUrl(input);
        if (
          typeof processedUrl === "string" &&
          processedUrl.startsWith("/internal/")
        ) {
          const iframe = document.querySelector(
            "iframe.active",
          ) as HTMLIFrameElement | null;
          if (iframe) {
            iframe.setAttribute("src", processedUrl);

            window.dispatchEvent(
              new CustomEvent("tabNavigated", {
                detail: {
                  tabId: iframe.getAttribute("data-tab-id") || "unknown",
                  url: processedUrl,
                  fromSearch: true,
                },
              }),
            );
          }
        }
      } else {
        await this.proxy.redirect(this.swConfig, this.proxySetting, input);

        const iframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement | null;
        if (iframe) {
          window.dispatchEvent(
            new CustomEvent("tabNavigated", {
              detail: {
                tabId: iframe.getAttribute("data-tab-id") || "unknown",
                url: input,
                fromSearch: true,
              },
            }),
          );
        }
      }
    } catch (error) {
      console.error("Direct navigation error:", error);
      this.data.createLog(`Direct navigation error: ${error}`);
    }
  }

  private async handleGameClick(game: GameData): Promise<void> {
    this.clearSuggestions();
    const suggestionListElem = document.querySelector(
      "#suggestion-list",
    ) as HTMLElement | null;
    if (suggestionListElem) {
      suggestionListElem.style.display = "none";
    }

    try {
      await this.proxy.redirect(this.swConfig, this.proxySetting, game.link);

      const iframe = document.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      if (iframe) {
        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              url: game.link,
              fromGame: true,
              gameTitle: game.name,
            },
          }),
        );
      }
    } catch (error) {
      console.error("Game navigation error:", error);
      this.data.createLog(`Game navigation error: ${error}`);
    }
  }

  async fetchAppData(): Promise<void> {
    try {
      const response = await fetch("/json/g.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.appsData = await response.json();
    } catch (error) {
      console.error("Error fetching game data:", error);
      this.data.createLog(`Failed to fetch game data: ${error}`);
      this.appsData = [];
    }
  }
}

export { Search };
