import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "../global/panic";
import "./shared/themeInit";

import { createIcons, icons } from "lucide";
import { Nightmare } from "@libs/Nightmare/nightmare";

interface Game {
  name: string;
  link: string;
  image: string;
  categories: string[];
}

document.addEventListener("DOMContentLoaded", async () => {
  const ui = new Nightmare();

  let games: Game[] = [];

  try {
    const res = await fetch("/json/g.json");
    games = (await res.json()) as Game[];
  } catch (err) {
    console.error("Failed to fetch /json/g.json:", err);
  }

  games.sort((a, b) => a.name.localeCompare(b.name));

  const grid = document.getElementById("games-grid")!;
  const searchInput = document.getElementById(
    "games-search",
  ) as HTMLInputElement;
  const clearBtn = document.getElementById("games-clear")!;
  const catBtns = document.querySelectorAll<HTMLButtonElement>(
    "#game-categories button",
  );

  let activeCat = "all";
  let searchTerm = "";

  function extractHost(url: string): string {
    try {
      const { hostname } = new URL(url);
      return hostname.replace(/^www\./, "");
    } catch {
      return "unknown";
    }
  }

  function render() {
    let filtered = games;

    if (activeCat !== "all") {
      filtered = filtered.filter((g) => g.categories.includes(activeCat));
    }

    if (searchTerm) {
      filtered = filtered.filter((g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    grid.innerHTML = "";

    filtered.forEach((g) => {
      const article = ui.createElement("article", {
        class:
          "group relative rounded-2xl bg-[var(--bg-2)] ring-1 ring-inset ring-[var(--white-08)] shadow-[0_0_1px_var(--shadow-outer)] transition hover:ring-[var(--main-35a)] overflow-visible",
        "data-cat": g.categories.join(" "),
      });

      const imageContainer = ui.createElement("div", {
        class: "relative aspect-video overflow-hidden rounded-t-2xl",
      });

      const mainImage = ui.createElement("img", {
        src: g.image,
        alt: g.name,
        loading: "lazy",
        class:
          "h-full w-full object-cover transition duration-300 group-hover:blur-md",
      });

      imageContainer.appendChild(mainImage);

      const contentDiv = ui.createElement("div", {
        class: "p-4 relative",
      });

      const flexDiv = ui.createElement("div", {
        class: "flex items-start gap-3",
      });

      const thumbnailImage = ui.createElement("img", {
        src: g.image,
        alt: g.name,
        loading: "lazy",
        class: "h-9 w-9 rounded-md object-cover",
      });

      const textContainer = ui.createElement("div", {
        class: "min-w-0 flex-1",
      });

      const headerDiv = ui.createElement("div", {
        class: "flex items-center justify-between gap-2",
      });

      const title = ui.createElement(
        "h3",
        {
          class: "text-sm font-medium text-[var(--text)] truncate",
        },
        [g.name],
      );

      const bookmarkBtn = ui.createElement("button", {
        "data-action": "bookmark",
        "aria-pressed": "false",
        class:
          "grid place-items-center h-8 w-8 rounded-lg hover:bg-[var(--white-05)] z-[99999]",
      });

      const bookmarkIcon = ui.createElement("i", {
        "data-lucide": "bookmark",
        class: "h-4 w-4",
      });

      bookmarkBtn.appendChild(bookmarkIcon);
      headerDiv.appendChild(title);
      headerDiv.appendChild(bookmarkBtn);

      const hostText = ui.createElement(
        "p",
        {
          class: "text-xs text-[var(--proto)] truncate",
        },
        [`Hosted by ${extractHost(g.link)}`],
      );

      textContainer.appendChild(headerDiv);
      textContainer.appendChild(hostText);

      flexDiv.appendChild(thumbnailImage);
      flexDiv.appendChild(textContainer);

      const hoverMenu = ui.createElement("div", {
        class:
          "absolute bottom-full left-0 right-0 bg-[var(--bg-1)] ring-1 ring-inset ring-[var(--white-08)] rounded-t-xl p-3 opacity-0 translate-y-2 transition duration-200 group-hover:opacity-100 group-hover:translate-y-0 flex flex-col gap-2",
      });

      const playButton = ui.createElement("button", {
        class:
          "inline-flex items-center gap-2 text-sm font-semibold rounded-lg px-4 py-2 ring-1 ring-inset ring-[var(--white-08)] bg-[var(--bg-2)]/70 backdrop-blur hover:bg-[var(--white-05)]",
        onclick: () => {
          (window.parent as any).protocols.navigate(
            (window.parent as any).proxy.search(g.link),
          );
        },
      });

      const playIcon = ui.createElement("i", {
        "data-lucide": "play",
        class: "h-4 w-4",
      });

      playButton.appendChild(playIcon);
      playButton.appendChild(document.createTextNode("Play"));

      hoverMenu.appendChild(playButton);

      contentDiv.appendChild(flexDiv);
      contentDiv.appendChild(hoverMenu);

      article.appendChild(imageContainer);
      article.appendChild(contentDiv);

      grid.appendChild(article);
    });

    createIcons({ icons });
  }

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    render();
  });

  clearBtn.addEventListener("click", () => {
    searchTerm = "";
    searchInput.value = "";
    render();
  });

  catBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCat = btn.dataset.cat || "all";
      catBtns.forEach((b) => b.classList.remove("bg-[var(--white-05)]"));
      btn.classList.add("bg-[var(--white-05)]");
      render();
    });
  });

  render();

  const searchBar = document.getElementById("games-search")?.parentElement;
  if (searchBar) {
    searchBar.classList.add("sticky", "top-0", "z-50", "bg-[var(--bg-2)]");
  }
});
