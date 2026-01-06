import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { Protocols } from "@browser/protocols";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { Proxy } from "@apis/proxy";
import type { Section, GameData, SearchInterface } from "./types";
import { isValidUrl } from "./utils";
import {
  createSection,
  createSuggestionItem,
  createGameItem,
} from "./ui";
import {
  fetchSearchSuggestions,
  fetchAppData,
  populateSearchResults,
  populateInternalPages,
  populateGames,
  populateSettings,
  getAvailableInternalPages,
} from "./suggestions";
import {
  handleSuggestionClick,
  handleDirectNavigation,
  handleGameClick,
  syncAddressBar,
} from "./navigation";

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
  private internalPages: Array<{ name: string; url: string; keywords: string[] }> = [];

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

    this.internalPages = await getAvailableInternalPages();

    const suggestionList = this.ui.createElement("div", {
      class:
        "suggestion-list fixed z-[9999] left-1/2 transform w-full max-w-2xl bg-[var(--bg-2)] rounded-xl shadow-lg border border-[var(--main-35a)] backdrop-blur-sm",
      id: "suggestion-list",
      style:
        "top: 30%; transform: translate(-50%, -50%); min-height: 20vh; max-height: 40vh; overflow-y: auto; display: none;",
    });

    this.sections = {
      searchResults: createSection(this.ui, "Search Results", "search"),
      internalPages: createSection(this.ui, "Internal Pages", "folder"),
      games: createSection(this.ui, "Games", "gamepad-2"),
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
            await handleDirectNavigation(
              searchbar.value.trim(),
              this.proto,
              this.proxy,
              this.swConfig,
              this.proxySetting,
              this.data,
            );
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
        await syncAddressBar(activeIframe, searchbar, this.proto, this.data);
      });
    }
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
      const suggestions = await fetchSearchSuggestions(
        cleanedQuery,
        this.maxExpandedResults,
      );

      if (isValidUrl(query) && !suggestions.includes(query)) {
        suggestions.unshift(query);
      }

      this.populateSearchResultsSection(suggestions);
      this.populateInternalPagesSection(query);
      await this.populateGamesSection(query);

      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    } catch (error) {
      console.error("Search error:", error);
      this.data.createLog(`Search error: ${error}`);
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

  populateSearchResultsSection(suggestions: string[]): void {
    const { searchResults, section } = this.sections.searchResults;
    populateSearchResults(searchResults, section, suggestions, (suggestion) =>
      createSuggestionItem(
        this.ui,
        suggestion,
        async () => {
          this.clearSuggestions();
          const suggestionListElem = document.querySelector(
            "#suggestion-list",
          ) as HTMLElement | null;
          if (suggestionListElem) {
            suggestionListElem.style.display = "none";
          }
          await handleSuggestionClick(
            suggestion,
            this.proto,
            this.proxy,
            this.swConfig,
            this.proxySetting,
            this.data,
          );
        },
        "search",
      ),
    );
  }

  populateInternalPagesSection(query: string): void {
    const { searchResults, section } = this.sections.internalPages;
    populateInternalPages(
      searchResults,
      section,
      query,
      this.internalPages,
      (url, name) =>
        createSuggestionItem(
          this.ui,
          url,
          async () => {
            this.clearSuggestions();
            const suggestionListElem = document.querySelector(
              "#suggestion-list",
            ) as HTMLElement | null;
            if (suggestionListElem) {
              suggestionListElem.style.display = "none";
            }
            await handleSuggestionClick(
              url,
              this.proto,
              this.proxy,
              this.swConfig,
              this.proxySetting,
              this.data,
            );
          },
          "folder",
          name,
        ),
    );
  }

  async populateGamesSection(query: string): Promise<void> {
    if (this.appsData.length === 0) {
      this.appsData = await fetchAppData(this.data);
    }

    const { searchResults, section } = this.sections.games;
    populateGames(searchResults, section, query, this.appsData, (game) =>
      createGameItem(this.ui, game, async () => {
        this.clearSuggestions();
        const suggestionListElem = document.querySelector(
          "#suggestion-list",
        ) as HTMLElement | null;
        if (suggestionListElem) {
          suggestionListElem.style.display = "none";
        }
        await handleGameClick(
          game,
          this.proxy,
          this.swConfig,
          this.proxySetting,
          this.data,
        );
      }),
    );
  }

  async populateSettingsSection(query: string): Promise<void> {
    if (!this.sections.settings) return;

    const { searchResults, section } = this.sections.settings;
    await populateSettings(searchResults, section, query, (url) =>
      createSuggestionItem(
        this.ui,
        url,
        async () => {
          this.clearSuggestions();
          const suggestionListElem = document.querySelector(
            "#suggestion-list",
          ) as HTMLElement | null;
          if (suggestionListElem) {
            suggestionListElem.style.display = "none";
          }
          await handleSuggestionClick(
            url,
            this.proto,
            this.proxy,
            this.swConfig,
            this.proxySetting,
            this.data,
          );
        },
        "settings",
      ),
    );
  }
}

export { Search };
