// src/pages/settings/sections/searchEngine.ts
//
// Search engine section (round 2 — native rebuild).
//
// Main view: 3 rows
//   - Default search engine (inline current-engine label + Change dropdown)
//   - Search suggestions (createToggle, key "searchSuggestions", default true)
//   - Manage search engines & bangs (drill-down to Manage subpage)
//
// Manage subpage: native bangs table built on `SearchEngineRegistry` directly.
// No more legacy `m.initializeSearchEnginesUI()` piggyback.

import { settingsSearch } from "../components/settingsSearch";
import { createRow } from "../components/row";
import { createSubpage } from "../components/subpage";
import { createToggle } from "../components/toggle";
import { openSwitcherDropdown } from "../components/profileSwitcher";
import { openModal } from "../components/modal";
import { getEventsAPI } from "../data/host";
import type { SectionContext } from "./types";
import type { SearchEngine, SearchEngineRegistry } from "../../../apis/searchEngines";

export async function render(container: HTMLElement, ctx: SectionContext): Promise<void> {
  container.innerHTML = "";
  if (ctx.subpage === "manage") return renderManage(container);
  return renderMain(container);
}

function renderMain(container: HTMLElement): void {
  const section = document.createElement("div");
  section.className = "settings-section";
  section.dataset.sectionId = "search-engine";

  const h2 = document.createElement("h2");
  h2.className = "settings-section-title";
  h2.textContent = "Search engine";
  section.appendChild(h2);

  // Default engine row — inline current-engine label + Change dropdown.
  const engineRow = document.createElement("div");
  engineRow.className = "settings-row no-hover";
  const stack = document.createElement("div");
  stack.className = "row-stack";
  const label = document.createElement("div");
  label.className = "row-label";
  label.textContent = "Search engine";
  stack.appendChild(label);
  const sub = document.createElement("div");
  sub.className = "row-sub";
  sub.textContent = "Used in the address bar and on the new-tab page.";
  stack.appendChild(sub);
  engineRow.appendChild(stack);

  const right = document.createElement("div");
  right.className = "row-right";
  const nameEl = document.createElement("span");
  nameEl.style.color = "var(--proto)";
  nameEl.style.marginRight = "4px";
  nameEl.textContent = "Loading…";
  right.appendChild(nameEl);
  const changeBtn = document.createElement("button");
  changeBtn.className = "settings-button ghost";
  changeBtn.textContent = "Change";
  right.appendChild(changeBtn);
  engineRow.appendChild(right);

  settingsSearch.register({
    id: "search/default",
    label: "Search engine",
    description: "Used in the address bar and on the new-tab page.",
    sectionId: "search-engine",
    keywords: ["default", "duckduckgo", "google", "bing"],
    element: engineRow,
  });
  section.appendChild(engineRow);

  void wireEngineRow(nameEl, changeBtn);

  // Search suggestions toggle — uses the canonical createToggle now.
  section.appendChild(
    createToggle({
      icon: "lightbulb",
      label: "Search suggestions",
      description: "Show suggestions from your search engine as you type.",
      settingKey: "searchSuggestions",
      defaultValue: true,
      searchUnit: {
        id: "search/suggestions",
        label: "Search suggestions",
        sectionId: "search-engine",
        keywords: ["autocomplete", "address bar"],
      },
    }).element,
  );

  // Manage drill-down
  section.appendChild(
    createRow({
      icon: "settings",
      label: "Manage search engines & bangs",
      description: "Add, edit, remove, and set defaults for engines + bang shortcuts.",
      right: { kind: "chevron" },
      onClick: () => {
        location.hash = "#search-engine?subpage=manage";
      },
      searchUnit: {
        id: "search/manage",
        label: "Manage search engines & bangs",
        sectionId: "search-engine",
        keywords: ["add", "edit", "shortcut", "bang", "custom"],
      },
    }),
  );

  container.appendChild(section);
}

async function loadRegistry(): Promise<SearchEngineRegistry> {
  const [{ SearchEngineRegistry }, { SettingsAPI }] = await Promise.all([
    import("../../../apis/searchEngines"),
    import("../../../apis/settings"),
  ]);
  const api = new SettingsAPI();
  const reg = new SearchEngineRegistry(api);
  await reg.load();
  return reg;
}

async function wireEngineRow(nameEl: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  try {
    const registry = await loadRegistry();
    const refresh = () => {
      const current = registry.getDefault();
      nameEl.textContent = current?.name ?? "(none configured)";
    };
    refresh();

    btn.addEventListener("click", () => {
      const engines = registry.list();
      if (engines.length === 0) {
        openSwitcherDropdown(btn, [
          {
            id: "",
            iconOnly: "info",
            label: "No search engines configured",
            onClick: () => {},
          },
        ]);
        return;
      }
      const entries = engines.map((e) => ({
        id: e.id,
        iconOnly: "search",
        label: e.name,
        onClick: async () => {
          try {
            await registry.setDefault(e.id);
            refresh();
            try { getEventsAPI().emit("search-engines:changed", null); } catch { /* ignore */ }
          } catch (err) {
            console.error("[settings] setDefault failed", err);
          }
        },
      }));
      openSwitcherDropdown(btn, entries);
    });
  } catch (e) {
    nameEl.textContent = "(unavailable)";
    console.error("[settings] engine load failed", e);
  }
}

async function renderManage(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  const sub = createSubpage({
    parentLabel: "Search engine",
    title: "Search engines & bangs",
    parentSectionId: "search-engine",
    render: async (body) => {
      const registry = await loadRegistry();
      renderEngineTable(body, registry);
    },
  });
  container.appendChild(sub);
}

function renderEngineTable(body: HTMLElement, registry: SearchEngineRegistry): void {
  body.innerHTML = "";

  const list = document.createElement("div");
  list.className = "ddx-engine-table";
  body.appendChild(list);

  const engines = registry.list();
  const defaultEngine = registry.getDefault();

  for (const engine of engines) {
    list.appendChild(
      renderEngineRow(engine, engine.id === defaultEngine?.id, registry, body),
    );
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "settings-button";
  addBtn.textContent = "+ Add search engine";
  addBtn.style.marginTop = "16px";
  addBtn.addEventListener("click", () => openEngineEditor(null, registry, body));
  body.appendChild(addBtn);

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.className = "settings-button ghost";
  resetBtn.textContent = "Reset to defaults";
  resetBtn.style.marginTop = "8px";
  resetBtn.style.marginLeft = "8px";
  resetBtn.addEventListener("click", () => {
    openModal({
      title: "Reset search engines to defaults?",
      description:
        "All user-added engines will be removed. Built-in engines will be restored.",
      primary: {
        label: "Reset",
        variant: "danger",
        onClick: async () => {
          await registry.reset();
          try { getEventsAPI().emit("search-engines:changed", null); } catch { /* ignore */ }
          renderEngineTable(body, registry);
        },
      },
      secondary: { label: "Cancel", onClick: () => {} },
    });
  });
  body.appendChild(resetBtn);
}

function renderEngineRow(
  engine: SearchEngine,
  isDefault: boolean,
  registry: SearchEngineRegistry,
  body: HTMLElement,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";

  // Radio
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "default-engine";
  radio.checked = isDefault;
  radio.style.marginRight = "12px";
  radio.addEventListener("change", async () => {
    if (radio.checked) {
      await registry.setDefault(engine.id);
      try { getEventsAPI().emit("search-engines:changed", null); } catch { /* ignore */ }
    }
  });
  row.appendChild(radio);

  const stack = document.createElement("div");
  stack.className = "row-stack";
  const label = document.createElement("div");
  label.className = "row-label";
  label.textContent = engine.name;
  stack.appendChild(label);
  const desc = document.createElement("div");
  desc.className = "row-sub";
  const bangPart = engine.bang ? `!${engine.bang}` : "";
  const atPart = engine.at ? `@${engine.at}` : "";
  desc.textContent = [bangPart, atPart].filter(Boolean).join("   ");
  stack.appendChild(desc);
  row.appendChild(stack);

  const right = document.createElement("div");
  right.className = "row-right";

  // Pill for built-in
  if (engine.builtIn) {
    const pill = document.createElement("span");
    pill.className = "ddx-row-pill";
    pill.textContent = "Built-in";
    right.appendChild(pill);
  }

  // Edit
  const editBtn = document.createElement("button");
  editBtn.className = "settings-button ghost";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openEngineEditor(engine, registry, body));
  right.appendChild(editBtn);

  // Delete (user-added only)
  if (!engine.builtIn) {
    const delBtn = document.createElement("button");
    delBtn.className = "settings-button ghost";
    delBtn.textContent = "Delete";
    delBtn.style.marginLeft = "8px";
    delBtn.addEventListener("click", async () => {
      await registry.remove(engine.id);
      try { getEventsAPI().emit("search-engines:changed", null); } catch { /* ignore */ }
      renderEngineTable(body, registry);
    });
    right.appendChild(delBtn);
  }

  row.appendChild(right);

  settingsSearch.register({
    id: `search-engine/manage/${engine.id}`,
    label: engine.name,
    description: desc.textContent || "",
    sectionId: "search-engine",
    keywords: [engine.bang, engine.at].filter(Boolean) as string[],
    element: row,
  });

  return row;
}

function openEngineEditor(
  existing: SearchEngine | null,
  registry: SearchEngineRegistry,
  body: HTMLElement,
): void {
  // Build body element manually (modal expects HTMLElement, not callback).
  const bodyEl = document.createElement("div");

  const make = (labelText: string, placeholder: string): HTMLInputElement => {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    const lbl = document.createElement("label");
    lbl.textContent = labelText;
    lbl.style.display = "block";
    lbl.style.marginBottom = "4px";
    lbl.style.fontSize = "13px";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "modal-input";
    inp.placeholder = placeholder;
    inp.style.width = "100%";
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    bodyEl.appendChild(wrap);
    return inp;
  };

  const nameInput = make("Name", "DuckDuckGo");
  const bangInput = make("Bang (without !) — optional", "ddg");
  const atInput = make("At (without @) — optional", "ddg");
  const urlInput = make("URL template (must contain %s)", "https://duckduckgo.com/?q=%s");

  if (existing) {
    nameInput.value = existing.name;
    bangInput.value = existing.bang || "";
    atInput.value = existing.at || "";
    urlInput.value = existing.urlTemplate;
    if (existing.builtIn) {
      nameInput.disabled = true;
      urlInput.disabled = true;
    }
  }

  const errorEl = document.createElement("div");
  errorEl.style.color = "var(--error)";
  errorEl.style.fontSize = "12px";
  errorEl.style.marginTop = "8px";
  bodyEl.appendChild(errorEl);

  const handle = openModal({
    title: existing ? `Edit ${existing.name}` : "Add search engine",
    body: bodyEl,
    primary: {
      label: "Save",
      closeOnClick: false, // close manually on success only
      onClick: async () => {
        errorEl.textContent = "";
        try {
          const patch = {
            name: nameInput.value.trim(),
            bang: bangInput.value.trim(),
            at: atInput.value.trim() || undefined,
            urlTemplate: urlInput.value.trim(),
          };
          if (existing) await registry.update(existing.id, patch);
          else await registry.add(patch);
          try { getEventsAPI().emit("search-engines:changed", null); } catch { /* ignore */ }
          handle.close();
          renderEngineTable(body, registry);
        } catch (err) {
          errorEl.textContent =
            err instanceof Error ? err.message : String(err);
        }
      },
    },
    secondary: { label: "Cancel", onClick: () => {} },
  });
}
