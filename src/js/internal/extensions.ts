import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "./shared/themeInit";
import "../global/panic";
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

// Replace the old recursive search with a proper implementation and add marketplace integration
function applySearch(): void {
  const q = (searchInput?.value || "").trim();
  cards().forEach((c) => {
    const ok = matchesQuery(c, q);
    if (c.hasAttribute("hidden")) return;
    c.style.display = ok ? "" : "none";
    c.toggleAttribute("aria-hidden", !ok);
  });
}

searchInput?.addEventListener("input", applySearch);

// Run an initial search pass
applySearch();

// --- Marketplace / Reflux integration ---
async function loadScript(src: string, asModule = false): Promise<void> {
  return new Promise((resolve, reject) => {
    // don't double-load
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.setAttribute("data-src", src);
    if (asModule) s.type = "module";
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

async function ensureRefluxInstance(): Promise<any> {
  // If an instance already exists, return it
  if ((window as any).RefluxAPIInstance) return (window as any).RefluxAPIInstance;

  // Try to find a global module first
  let ctor: any = (window as any).RefluxAPIModule?.RefluxAPI || (window as any).RefluxAPIModule;

  if (!ctor) {
    // Try loading the shipped script
    try {
      await loadScript("/reflux/api.js");
      ctor = (window as any).RefluxAPIModule?.RefluxAPI || (window as any).RefluxAPIModule;
    } catch (err) {
      console.error("Failed to load Reflux API script:", err);
      throw err;
    }
  }

  if (!ctor || typeof ctor !== "function") {
    console.error("Reflux API constructor not found on window:", (window as any).RefluxAPIModule);
    throw new Error("Reflux API unavailable");
  }

  try {
    const api = new ctor();
    (window as any).RefluxAPIInstance = api;
    console.log("RefluxAPI instance created", api);
    return api;
  } catch (err) {
    console.error("Failed to instantiate Reflux API:", err);
    throw err;
  }
}

async function fetchCatalogAssets(): Promise<Array<any>> {
  try {
    const res = await fetch("/api/catalog-assets/");
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    const assetsObj = json.assets || {};
    return Object.keys(assetsObj).map((k) => ({ package_name: k, ...assetsObj[k] }));
  } catch (err) {
    console.error("Failed to fetch catalog assets:", err);
    return [];
  }
}

function normalizeSites(sites: any): string[] {
  if (!sites) return ["*"];
  if (Array.isArray(sites)) return sites;
  // sometimes backend stores stringified arrays or '[object Object]'
  try {
    if (typeof sites === "string") {
      // try JSON parse
      const parsed = JSON.parse(sites);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // ignore
  }
  return ["*"];
}

async function renderMarketplace(containerId = "extensionsGrid") {
  const root = document.getElementById(containerId);
  if (!root) return;

  // insert marketplace list above the grid
  const wrapper = document.createElement("div");
  wrapper.className = "mb-6";
  wrapper.innerHTML = `<div class=\"border-b border-[var(--white-08)] pb-4 mb-4\"><h2 class=\"text-xl font-semibold text-[var(--text)] mb-2\">Marketplace</h2><p class=\"text-sm text-[var(--proto)]\">Import plugins from the remote catalog into your Reflux runtime.</p></div>`;

  const list = document.createElement("div");
  list.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  wrapper.appendChild(list);

  // try fetching assets
  const assets = await fetchCatalogAssets();

  if (assets.length === 0) {
    const note = document.createElement("div");
    note.className = "text-sm text-[var(--proto)]";
    note.textContent = "No marketplace assets available.";
    wrapper.appendChild(note);
    root.parentElement?.insertBefore(wrapper, root);
    return;
  }

  assets.forEach((asset) => {
    const card = document.createElement("div");
    card.className = "bg-[var(--bg-1)] rounded-2xl p-5 ring-1 ring-inset ring-[var(--white-08)]";

    const title = document.createElement("h3");
    title.className = "text-sm font-medium text-[var(--text)] mb-1";
    title.textContent = asset.title || asset.package_name;

    const desc = document.createElement("p");
    desc.className = "text-xs text-[var(--proto)] mb-3";
    desc.textContent = asset.description || "No description";

    const meta = document.createElement("div");
    meta.className = "flex items-center justify-between gap-2";
    const left = document.createElement("div");
    left.appendChild(title);
    left.appendChild(desc);

    const right = document.createElement("div");

    const importBtn = document.createElement("button");
    importBtn.className = "px-3 py-2 rounded-lg bg-[var(--main)] text-[var(--bg-2)] text-sm hover:bg-[var(--main)]/90";
    importBtn.textContent = "Import & Install";

    const status = document.createElement("span");
    status.className = "text-xs text-[var(--proto)] ml-2";
    status.textContent = "";

    importBtn.addEventListener("click", async () => {
      importBtn.disabled = true;
      status.textContent = "Importing...";
      try {
        const api = await ensureRefluxInstance();

        const plugin = {
          function: asset.function || "",
          name: asset.package_name,
          title: asset.title,
          description: asset.description,
          author: asset.author,
          version: asset.version,
          sites: normalizeSites(asset.sites),
        };

        // prefer api.addPlugin, but be tolerant if API shape differs
        if (typeof api.addPlugin === "function") {
          await api.addPlugin(plugin);
        } else if (typeof api.createPlugin === "function") {
          await api.createPlugin(plugin);
        } else {
          throw new Error("Reflux API missing addPlugin method");
        }

        // enable if possible
        if (typeof api.enablePlugin === "function") {
          await api.enablePlugin(plugin.name);
        }

        status.textContent = "Installed";
      } catch (err) {
        console.error("Failed to import plugin:", err);
        status.textContent = "Failed";
      } finally {
        importBtn.disabled = false;
      }
    });

    right.appendChild(importBtn);
    right.appendChild(status);

    meta.appendChild(left);
    meta.appendChild(right);

    card.appendChild(meta);
    list.appendChild(card);
  });

  root.parentElement?.insertBefore(wrapper, root);
}

// Render marketplace list (best-effort)
renderMarketplace().catch((e) => console.error("Marketplace render failed:", e));
