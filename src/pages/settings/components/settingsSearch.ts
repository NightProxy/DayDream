// Settings search: registry of "searchable units" (rows, toggles, buttons),
// + a filter() method that hides non-matching units and dims the rail.

export interface SearchUnit {
  id: string;
  label: string;
  description?: string;
  sectionId: string;
  keywords?: string[];
  element: HTMLElement;
}

class SettingsSearchImpl {
  private units = new Map<string, SearchUnit>();
  private scopeSectionId: string | null = null;

  register(unit: SearchUnit): () => void {
    this.units.set(unit.id, unit);
    return () => this.units.delete(unit.id);
  }

  clearAll(): void {
    this.units.clear();
  }

  scope(sectionId: string | null): void {
    this.scopeSectionId = sectionId;
  }

  filter(query: string): void {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.restore();
      return;
    }
    const words = q.split(/\s+/);
    let anyMatch = false;
    const matchedSections = new Set<string>();

    for (const unit of this.units.values()) {
      if (this.scopeSectionId && unit.sectionId !== this.scopeSectionId) continue;
      const haystack = (
        unit.label +
        " " +
        (unit.description ?? "") +
        " " +
        (unit.keywords ?? []).join(" ")
      ).toLowerCase();
      const matches = words.every((w) => haystack.includes(w));
      unit.element.classList.toggle("search-hide", !matches);
      unit.element.classList.toggle("search-match", matches);
      if (matches) {
        anyMatch = true;
        matchedSections.add(unit.sectionId);
      }
    }

    // Hide sections with no matches
    for (const sectionEl of document.querySelectorAll<HTMLElement>("[data-section-id]")) {
      const id = sectionEl.dataset.sectionId!;
      sectionEl.classList.toggle("search-hide", !matchedSections.has(id));
    }

    // Dim rail
    for (const railEl of document.querySelectorAll<HTMLElement>(".rail-item")) {
      railEl.classList.add("dim");
    }

    this.toggleEmptyState(!anyMatch, query);
  }

  restore(): void {
    for (const unit of this.units.values()) {
      unit.element.classList.remove("search-hide", "search-match");
    }
    for (const sectionEl of document.querySelectorAll<HTMLElement>("[data-section-id]")) {
      sectionEl.classList.remove("search-hide");
    }
    for (const railEl of document.querySelectorAll<HTMLElement>(".rail-item")) {
      railEl.classList.remove("dim");
    }
    this.toggleEmptyState(false, "");
  }

  private toggleEmptyState(show: boolean, query: string): void {
    const content = document.getElementById("settings-content");
    if (!content) return;
    let empty = content.querySelector<HTMLElement>(".settings-empty-state");
    if (show) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "settings-empty-state";
        empty.innerHTML = `
          <i data-lucide="search-x" class="empty-icon"></i>
          <div class="empty-title">No settings match "${query.replace(/"/g, "&quot;")}"</div>
          <div class="empty-sub">Try opening the relevant section.</div>
        `;
        content.appendChild(empty);
        import("lucide").then(({ createIcons, icons }) => createIcons({ icons }));
      } else {
        const title = empty.querySelector(".empty-title");
        if (title) title.textContent = `No settings match "${query}"`;
        empty.classList.remove("search-hide");
      }
    } else {
      if (empty) empty.classList.add("search-hide");
    }
  }
}

export const settingsSearch = new SettingsSearchImpl();
