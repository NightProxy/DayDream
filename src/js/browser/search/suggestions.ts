import type { Logger } from "@apis/logging";
import type { GameData } from "./types";

export async function fetchSearchSuggestions(
  query: string,
  maxResults: number,
): Promise<string[]> {
  try {
    const response = await fetch(`/api/results/${encodeURIComponent(query)}`);
    if (!response.ok) return [];

    const data = await response.json();
    return data.map((item: any) => item.phrase).slice(0, maxResults);
  } catch (error) {
    console.warn("Failed to fetch search suggestions:", error);
    return [];
  }
}

export async function fetchAppData(logger: Logger): Promise<GameData[]> {
  try {
    const response = await fetch("/json/g.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching game data:", error);
    logger.createLog(`Failed to fetch game data: ${error}`);
    return [];
  }
}

export function populateSearchResults(
  searchResults: HTMLElement,
  section: HTMLElement,
  suggestions: string[],
  createItem: (suggestion: string) => HTMLElement,
): void {
  if (suggestions.length > 0) {
    section.style.display = "block";
    suggestions.forEach((suggestion: string) => {
      const listItem = createItem(suggestion);
      searchResults.appendChild(listItem);
    });
  } else {
    section.style.display = "none";
  }
}

const INTERNAL_PAGES_MAP: Record<string, { name: string; keywords: string[] }> =
  {
    bookmarks: {
      name: "Bookmarks",
      keywords: ["bookmarks", "favorites", "saved"],
    },
    error: { name: "Error", keywords: ["error", "404", "not found"] },
    extensions: {
      name: "Extensions",
      keywords: ["extensions", "addons", "plugins"],
    },
    games: { name: "Games", keywords: ["games", "play", "entertainment"] },
    history: { name: "History", keywords: ["history", "visited", "past"] },
    newtab: { name: "New Tab", keywords: ["newtab", "home", "start"] },
    privacy: { name: "Privacy", keywords: ["privacy", "policy", "terms"] },
    settings: {
      name: "Settings",
      keywords: ["settings", "config", "preferences"],
    },
    terms: { name: "Terms", keywords: ["terms", "service", "legal"] },
    updates: {
      name: "Updates",
      keywords: ["updates", "changelog", "news", "whats new"],
    },
  };

export async function getAvailableInternalPages(): Promise<
  Array<{ name: string; url: string; keywords: string[] }>
> {
  const pages = [];

  for (const [path, meta] of Object.entries(INTERNAL_PAGES_MAP)) {
    try {
      const response = await fetch(`/internal/${path}/index.html`, {
        method: "HEAD",
      });
      if (response.ok) {
        pages.push({
          name: meta.name,
          url: `ddx://${path}`,
          keywords: meta.keywords,
        });
      }
    } catch {
      continue;
    }
  }

  return pages;
}

export function populateInternalPages(
  searchResults: HTMLElement,
  section: HTMLElement,
  query: string,
  internalPages: Array<{ name: string; url: string; keywords: string[] }>,
  createItem: (url: string, name: string) => HTMLElement,
): void {
  const lowerQuery = query.toLowerCase();
  const filteredPages = internalPages
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
      const listItem = createItem(page.url, page.name);
      searchResults.appendChild(listItem);
    });
  } else {
    section.style.display = "none";
  }
}

export function populateGames(
  searchResults: HTMLElement,
  section: HTMLElement,
  query: string,
  appsData: GameData[],
  createItem: (game: GameData) => HTMLElement,
): void {
  if (query.trim() === "") {
    section.style.display = "none";
    return;
  }

  const lowerQuery = query.toLowerCase();
  const filteredGames = appsData
    .filter((app) => app.name.toLowerCase().includes(lowerQuery))
    .slice(0, 6);

  if (filteredGames.length > 0) {
    section.style.display = "block";
    filteredGames.forEach((game: GameData) => {
      const listItem = createItem(game);
      searchResults.appendChild(listItem);
    });
  } else {
    section.style.display = "none";
  }
}

export async function populateSettings(
  searchResults: HTMLElement,
  section: HTMLElement,
  query: string,
  createItem: (url: string) => HTMLElement,
): Promise<void> {
  let hasResults = false;
  const cleanedQuery = query.replace(/^(ddx:\/\/|ddx:\/|ddx:)/, "");
  const basePaths = [
    "settings",
    "settings/about",
    "settings/profile",
    "settings/privacy",
    "settings/security",
    "settings/notifications",
  ];
  const normalizedQuery = cleanedQuery.replace(/ /g, "");
  const predictedUrls = basePaths.map(
    (base) => `${base}${normalizedQuery ? `/${normalizedQuery}` : ""}`,
  );

  for (let url of predictedUrls) {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      const listItem = createItem(url);
      searchResults.appendChild(listItem);
      hasResults = true;
    } else if (!response.ok) {
      break;
    }
  }
  section.style.display = hasResults ? "block" : "none";
}
