import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "../global/panic";
import "./shared/themeInit";
import { createIcons, icons } from "lucide";

const STAR_KEY = "updates:starred";

const getStarSet = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const saveStarSet = (set: Set<string>) => {
  localStorage.setItem(STAR_KEY, JSON.stringify(Array.from(set)));
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 64);

const setStarFilled = (btn: HTMLElement, filled: boolean) => {
  const svg = btn.querySelector("svg");
  if (!svg) return;
  if (filled) {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const template = document.getElementById(
    "updates-item-template",
  ) as HTMLTemplateElement;
  const list = document.getElementById("updates-list")!;
  const raw = document.querySelectorAll<HTMLElement>("#updates-raw > div");
  const starSet = getStarSet();

  raw.forEach((src, idx) => {
    const frag = template.content.cloneNode(true) as DocumentFragment;
    const details = frag.querySelector("details")!;
    details.dataset.tags = src.dataset.tags || "";

    const baseId = `${slug(src.dataset.title || `item-${idx}`)}-${slug(src.dataset.date || `${idx}`)}`;
    details.dataset.id = baseId;

    const dot = frag.querySelector<HTMLElement>("[data-dot]")!;
    if (src.dataset.dot) dot.classList.add(`bg-[var(--${src.dataset.dot})]`);
    else dot.classList.add("bg-[var(--proto)]");

    const badges = frag.querySelector("[data-badges]")!;
    if (src.dataset.type) {
      const b = document.createElement("span");
      b.className =
        "inline-flex items-center gap-1 rounded-md bg-[var(--white-05)] px-2 py-0.5 text-[10px] ring-1 ring-inset ring-[var(--white-08)]";
      b.textContent = src.dataset.type;
      badges.appendChild(b);
    }
    if (src.dataset.version) {
      const v = document.createElement("span");
      v.className =
        "inline-flex items-center gap-1 rounded-md bg-[var(--main-20a)] px-2 py-0.5 text-[10px] text-[var(--text)] ring-1 ring-inset ring-[var(--main-35a)]";
      v.textContent = src.dataset.version;
      badges.appendChild(v);
    }
    if (src.dataset.date) {
      const t = document.createElement("time");
      t.className = "text-[10px] text-[var(--proto)]";
      t.textContent = src.dataset.date;
      badges.appendChild(t);
    }

    const title = frag.querySelector("[data-title]")!;
    title.textContent = src.dataset.title || "";

    const excerpt = frag.querySelector("[data-excerpt]")!;
    const firstP = src.querySelector("p");
    if (firstP) excerpt.textContent = firstP.textContent || "";

    const body = frag.querySelector("[data-body]")!;
    Array.from(src.children).forEach((node) => {
      if (
        node instanceof HTMLParagraphElement ||
        node instanceof HTMLUListElement ||
        node instanceof HTMLOListElement ||
        node instanceof HTMLImageElement ||
        node instanceof HTMLDivElement
      ) {
        body.appendChild(node.cloneNode(true));
      }
    });

    list.appendChild(frag);
  });

  const updatesCountEl = document.getElementById("updates-count");
  if (updatesCountEl) {
    updatesCountEl.textContent = raw.length.toString();
  }

  createIcons({ icons });
  document
    .querySelectorAll<HTMLDetailsElement>("#updates-list details")
    .forEach((details) => {
      const id = details.dataset.id || "";
      const starred = starSet.has(id);
      const starBtn = details.querySelector<HTMLElement>(
        '[data-action="star"]',
      )!;
      const applyStarUI = (on: boolean) => {
        starBtn.setAttribute("aria-pressed", on ? "true" : "false");
        details.dataset.starred = on ? "true" : "false";
        setStarFilled(starBtn, on);
      };
      applyStarUI(starred);
      starBtn.addEventListener("click", () => {
        const has = starSet.has(id);
        if (has) starSet.delete(id);
        else starSet.add(id);
        saveStarSet(starSet);
        applyStarUI(!has);
      });
    });

  const qfStarred = document.querySelector<HTMLElement>('[data-qf="starred"]');
  if (qfStarred) {
    let active = false;
    qfStarred.addEventListener("click", () => {
      active = !active;
      qfStarred.classList.toggle("bg-[var(--white-05)]", active);
      document
        .querySelectorAll<HTMLDetailsElement>("#updates-list details")
        .forEach((d) => {
          const on = d.dataset.starred === "true";
          if (active && !on) d.setAttribute("data-hidden", "true");
          else d.removeAttribute("data-hidden");
        });
    });
  }

  const qfNew = document.querySelector<HTMLElement>('[data-qf="new"]');
  if (qfNew) {
    let active = false;
    qfNew.addEventListener("click", () => {
      active = !active;
      qfNew.classList.toggle("bg-[var(--white-05)]", active);
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      document
        .querySelectorAll<HTMLDetailsElement>("#updates-list details")
        .forEach((d) => {
          const dateStr = d.dataset.date;
          if (!dateStr) return;
          const updateDate = new Date(dateStr).getTime();
          if (active && updateDate < sevenDaysAgo) {
            d.setAttribute("data-hidden", "true");
          } else if (!active) {
            d.removeAttribute("data-hidden");
          }
        });
    });
  }

  const searchInput = document.getElementById(
    "updates-search",
  ) as HTMLInputElement;
  const clearBtn = document.getElementById("updates-clear");
  const filterBtn = document.getElementById("updates-filter");
  const tagsContainer = document.getElementById("updates-tags");
  const emptySection = document.getElementById("updates-empty");

  let currentSearchQuery = "";
  let activeTag = "all";

  const filterUpdates = () => {
    const allUpdates = document.querySelectorAll<HTMLDetailsElement>(
      "#updates-list details",
    );
    let visibleCount = 0;

    allUpdates.forEach((update) => {
      const title =
        update.querySelector("[data-title]")?.textContent?.toLowerCase() || "";
      const excerpt =
        update.querySelector("[data-excerpt]")?.textContent?.toLowerCase() ||
        "";
      const tags = update.dataset.tags || "";

      const matchesSearch =
        currentSearchQuery === "" ||
        title.includes(currentSearchQuery) ||
        excerpt.includes(currentSearchQuery);

      const matchesTag = activeTag === "all" || tags.includes(activeTag);

      const shouldShow =
        matchesSearch && matchesTag && !update.hasAttribute("data-hidden");

      if (shouldShow) {
        update.style.display = "";
        visibleCount++;
      } else {
        update.style.display = "none";
      }
    });

    if (emptySection) {
      emptySection.hidden = visibleCount > 0;
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearchQuery = (e.target as HTMLInputElement).value
        .toLowerCase()
        .trim();
      filterUpdates();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        currentSearchQuery = "";
      }
      filterUpdates();
    });
  }

  if (filterBtn && tagsContainer) {
    filterBtn.addEventListener("click", () => {
      const isExpanded = filterBtn.getAttribute("aria-expanded") === "true";
      filterBtn.setAttribute("aria-expanded", (!isExpanded).toString());
      tagsContainer.style.display = isExpanded ? "none" : "flex";
    });
  }

  if (tagsContainer) {
    const tagButtons =
      tagsContainer.querySelectorAll<HTMLButtonElement>("button[data-tag]");
    tagButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tagButtons.forEach((b) => {
          b.classList.remove("bg-[var(--white-05)]");
          b.classList.add("ring-[var(--white-08)]");
        });

        btn.classList.add("bg-[var(--white-05)]");
        btn.classList.remove("ring-[var(--white-08)]");

        activeTag = btn.dataset.tag || "all";
        filterUpdates();
      });
    });
  }

  const resetCacheBtn = document.getElementById("reset-cache-btn");
  if (resetCacheBtn) {
    resetCacheBtn.addEventListener("click", async () => {
      const confirmed = confirm(
        "This will clear all cached data including profiles, settings, and history. The page will reload. Continue?",
      );
      if (!confirmed) return;

      try {
        await Promise.all([
          indexedDB.deleteDatabase("localforage"),
          indexedDB.deleteDatabase("NightPlus"),
          indexedDB.deleteDatabase("BrowserSettings"),
          indexedDB.deleteDatabase("Profiles"),
        ]);

        localStorage.clear();
        sessionStorage.clear();

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        }

        alert("Cache cleared successfully! The page will now reload.");
        window.location.reload();
      } catch (error) {
        console.error("Failed to clear cache:", error);
        alert(
          "Failed to clear some cached data. Try using your browser's clear cache feature.",
        );
      }
    });
  }
});
