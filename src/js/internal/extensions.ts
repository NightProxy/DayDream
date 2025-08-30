import "../../css/global.css";
import "basecoat-css/all";
import "../../js/global/theming.ts";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
  const aside = document.querySelector<HTMLElement>(
    '#aside[aside="extensions"]',
  );
  const toggleBtn = document.getElementById(
    "aside-toggle",
  ) as HTMLButtonElement | null;
  const closeBtn = document.getElementById(
    "aside-close",
  ) as HTMLButtonElement | null;

  const hide = (el?: HTMLElement | null) => el && el.classList.add("hidden");
  const show = (el?: HTMLElement | null) => el && el.classList.remove("hidden");

  const openAside = () => {
    if (!aside) return;
    hide(toggleBtn);
    show(closeBtn);
    aside.classList.remove("-translate-x-full");
    createIcons({ icons });
  };

  const closeAside = () => {
    if (!aside) return;
    const finalize = () => {
      hide(closeBtn);
      show(toggleBtn);
      aside.removeEventListener("transitionend", onEnd);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === aside && e.propertyName === "transform") finalize();
    };
    aside.addEventListener("transitionend", onEnd);
    aside.classList.add("-translate-x-full");
    window.setTimeout(finalize, 500);
  };

  toggleBtn?.addEventListener("click", openAside);
  closeBtn?.addEventListener("click", closeAside);

  createIcons({ icons });
});

const grid = document.getElementById("extensionsGrid") as HTMLElement | null;
const searchInput =
  document.querySelector<HTMLInputElement>("[data-ext-search]");
const cards = (): HTMLElement[] =>
  grid ? Array.from(grid.querySelectorAll<HTMLElement>("[data-card]")) : [];

function matchesQuery(card: HTMLElement, q: string): boolean {
  if (!q) return true;
  const name = card.getAttribute("data-name") || "";
  const tags = card.getAttribute("data-tags") || "";
  const desc = card.getAttribute("data-desc") || "";
  const hay = (name + " " + tags + " " + desc).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function applySearch(): void {
  const q = (searchInput?.value || "").trim();
  cards().forEach((c) => {
    const ok = matchesQuery(c, q);
    if (c.hasAttribute("hidden")) return;
    c.style.display = ok ? "" : "none";
    c.toggleAttribute("aria-hidden", !ok);
  });

  applySearch();
}

searchInput?.addEventListener("input", applySearch);
