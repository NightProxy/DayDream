import "../../css/global.css";
import "basecoat-css/all";
import { createIcons, icons } from "lucide";

document.addEventListener("DOMContentLoaded", async () => {
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
