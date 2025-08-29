import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "basecoat-css/all";
import { Nightmare } from "@libs/Nightmare/nightmare";
import { SettingsAPI } from "@apis/settings";
import { DDXGlobal } from "@js/global";
import { Proxy } from "@apis/proxy";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
  interface Game {
    name: string;
    link: string;
    image: string;
    categories: string[];
  }

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

    grid.innerHTML = filtered
      .map(
        (g) => `
      <article class="group relative rounded-2xl bg-[var(--bg-2)] ring-1 ring-inset ring-[var(--white-08)] shadow-[0_0_1px_var(--shadow-outer)] transition hover:ring-[var(--main-35a)] overflow-visible" data-cat="${g.categories.join(" ")}">
        <div class="relative aspect-video overflow-hidden rounded-t-2xl">
          <img src="${g.image}" alt="${g.name}" class="h-full w-full object-cover transition duration-300 group-hover:blur-md" />
        </div>
        <div class="p-4 relative">
          <div class="flex items-start gap-3">
            <img src="${g.image}" alt="${g.name}" class="h-9 w-9 rounded-md object-cover" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-medium text-[var(--text)] truncate">${g.name}</h3>
                <button data-action="bookmark" aria-pressed="false" class="grid place-items-center h-8 w-8 rounded-lg hover:bg-[var(--white-05)] z-[99999]">
                  <i data-lucide="bookmark" class="h-4 w-4"></i>
                </button>
              </div>
              <p class="text-xs text-[var(--proto)] truncate">Hosted by ${extractHost(g.link)}</p>
            </div>
          </div>
          <div class="absolute bottom-full left-0 right-0 bg-[var(--bg-1)] ring-1 ring-inset ring-[var(--white-08)] rounded-t-xl p-3 opacity-0 translate-y-2 transition duration-200 group-hover:opacity-100 group-hover:translate-y-0 flex flex-col gap-2">
            <a href="${g.link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-sm font-semibold rounded-lg px-4 py-2 ring-1 ring-inset ring-[var(--white-08)] bg-[var(--bg-2)]/70 backdrop-blur hover:bg-[var(--white-05)]">
              <i data-lucide="play" class="h-4 w-4"></i>
              Play
            </a>
          </div>
        </div>
      </article>
    `,
      )
      .join("");

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
});

const searchBar = document.getElementById("games-search")?.parentElement;
if (searchBar) {
  searchBar.classList.add(
    "sticky",
    "top-0",
    "z-50",
    "bg-[var(--bg-2)]"
  );
}

(async () => {
  const nightmare = new Nightmare();

  const settingsAPI = new SettingsAPI();

  const global = new DDXGlobal();

  const proxy = new Proxy();

  const proxySetting = (await settingsAPI.getItem("proxy")) ?? "sj";
  let swConfigSettings: Record<string, any> = {};
  const swConfig = {
    uv: {
      type: "sw",
      file: "/data/sw.js",
      config: window.__uv$config,
      func: null,
    },
    sj: {
      type: "sw",
      file: "/assets/sw.js",
      config: window.__scramjet$config,
      func: async () => {
        if ((await settingsAPI.getItem("scramjet")) != "fixed") {
          const scramjet = new ScramjetController(window.__scramjet$config);
          scramjet.init().then(async () => {
            await proxy.setTransports();
          });

          console.log("Scramjet Service Worker registered.");
        } else {
          const scramjet = new ScramjetController(window.__scramjet$config);
          scramjet.init().then(async () => {
            await proxy.setTransports();
          });

          console.log("Scramjet Service Worker registered.");
        }
      },
    },
    auto: {
      type: "multi",
      file: null,
      config: null,
      func: null,
    },
  };

  if (
    typeof swConfig[proxySetting as keyof typeof swConfig].func ===
      "function" &&
    proxySetting === "sj"
  ) {
    await (swConfig[proxySetting as keyof typeof swConfig].func as Function)();
  }
  proxy
    .registerSW(swConfig[proxySetting as keyof typeof swConfig])
    .then(async () => {
      await proxy.setTransports().then(async () => {
        const transport = await proxy.connection.getTransport();
        if (transport == null) {
          proxy.setTransports();
        }
      });
    });

  let appsData: any[];

  function getAppElement(app: any) {
    const appElement = nightmare.createElement(
      "div",
      {
        class: "app",
        onclick: () => {
          launch(app.link);
        },
      },
      [
        nightmare.createElement("div", { class: "img-container" }, [
          nightmare.createElement("img", { src: app.image }),
          nightmare.createElement("p", {}, [app.name]),
        ]),
      ],
    );

    return appElement;
  }

  function renderApps(filteredApps: any[] = []) {
    const appsGrid = document.getElementById("gamesGrid");
    appsGrid!.innerHTML = "";

    filteredApps.sort((a: any, b: any) => a.name.localeCompare(b.name));

    filteredApps.forEach((app) => {
      const appElement = getAppElement(app);
      appsGrid!.appendChild(appElement);
    });
  }

  async function fetchAppData() {
    try {
      const response = await fetch("/json/g.json");
      appsData = await response.json();
      return appsData;
    } catch (error) {
      console.error("Error fetching JSON data:", error);
      return [];
    }
  }

  async function initializePage() {
    await fetchAppData();
    renderApps(appsData);
  }

  initializePage();

  async function launch(link: string) {
    if (proxySetting === "auto") {
      const result = (await proxy.automatic(
        proxy.search(link),
        swConfig,
      )) as Record<string, any>;
      swConfigSettings = result;
    } else {
      swConfigSettings = swConfig[proxySetting as keyof typeof swConfig];
    }

    await proxy.registerSW(swConfigSettings).then(async () => {
      await proxy.setTransports();
    });

    let encodedUrl =
      swConfigSettings.config.prefix +
      window.__uv$config.encodeUrl(proxy.search(link));
    location.href = encodedUrl;
  }
})();
