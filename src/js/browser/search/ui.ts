import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import type { Section, GameData } from "./types";
import { isValidUrl } from "./utils";

export function createSection(
  ui: UI,
  titleText: string,
  iconName?: string,
): Section {
  const section = ui.createElement(
    "div",
    {
      class:
        "search-section p-4 border-b border-[var(--main-20a)] last:border-b-0",
      style: "display: none;",
    },
    [
      ui.createElement(
        "div",
        {
          class:
            "search-title flex items-center gap-2 mb-3 text-sm font-medium text-[var(--main)] uppercase tracking-wide",
        },
        [
          ui.createElement("i", {
            "data-lucide": iconName || "search",
            class: "w-4 h-4 text-[var(--main)]",
          }),
          ui.createElement("span", {}, [titleText]),
        ],
      ),
      ui.createElement("div", { class: "search-results space-y-1" }),
    ],
  );

  const searchResults = section.querySelector(
    ".search-results",
  ) as HTMLElement;
  return { section, searchResults };
}

export function createSuggestionItem(
  ui: UI,
  suggestion: string,
  onClick: () => void,
  iconName?: string,
  displayName?: string,
): HTMLElement {
  const listItem = ui.createElement(
    "div",
    {
      class:
        "flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--main-20a)] hover:border-l-2 hover:border-l-[var(--main)] cursor-pointer transition-all group border-l-2 border-l-transparent",
      tabindex: "-1",
    },
    [
      ui.createElement("i", {
        "data-lucide":
          iconName || (isValidUrl(suggestion) ? "external-link" : "search"),
        class:
          "w-4 h-4 text-[var(--proto)] group-hover:text-[var(--main)] transition-colors flex-shrink-0",
      }),
      ui.createElement(
        "div",
        {
          class: "flex-1 min-w-0",
        },
        [
          ui.createElement(
            "div",
            {
              class:
                "suggestion-text text-sm text-[var(--text)] truncate group-hover:text-[var(--text)]",
            },
            [displayName || suggestion],
          ),
          ...(displayName && displayName !== suggestion
            ? [
                ui.createElement(
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

  listItem.addEventListener("click", onClick);

  return listItem;
}

export function createGameItem(
  ui: UI,
  game: GameData,
  onClick: () => void,
): HTMLElement {
  const listItem = ui.createElement(
    "div",
    {
      class:
        "flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--main-20a)] hover:border-l-2 hover:border-l-[var(--main)] cursor-pointer transition-all group border-l-2 border-l-transparent",
      tabindex: "-1",
    },
    [
      ui.createElement(
        "div",
        {
          class:
            "w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-[var(--bg-1)] ring-1 ring-[var(--main-35a)]",
        },
        [
          ui.createElement("img", {
            src: game.image,
            alt: game.name,
            class: "w-full h-full object-cover",
            loading: "lazy",
          }),
        ],
      ),
      ui.createElement(
        "div",
        {
          class: "flex-1 min-w-0",
        },
        [
          ui.createElement(
            "div",
            {
              class:
                "text-sm text-[var(--text)] font-medium truncate group-hover:text-[var(--text)]",
            },
            [game.name],
          ),
          ui.createElement(
            "div",
            {
              class:
                "text-xs text-[var(--proto)] truncate group-hover:text-[var(--main-70)]",
            },
            ["Game"],
          ),
        ],
      ),
      ui.createElement("i", {
        "data-lucide": "gamepad-2",
        class:
          "w-4 h-4 text-[var(--proto)] group-hover:text-[var(--main)] transition-colors flex-shrink-0",
      }),
    ],
  );

  listItem.addEventListener("click", onClick);

  return listItem;
}
