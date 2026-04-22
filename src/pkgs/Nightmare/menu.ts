interface MenuItem {
  label: string;
  pageId: string;
}

class Menu {
  ui: NightmareUI;
  container: HTMLElement | null = null;
  dropdown: HTMLElement | null = null;
  dropdownButton: HTMLElement | null = null;
  dropdownOptions: HTMLElement | null = null;
  currentPage: string | null = null;
  menuTopBar: HTMLElement | null = null;
  pages: Record<string, HTMLElement> = {};

  constructor(ui: NightmareUI) {
    this.ui = ui;
  }

  createMenu(
    tag: HTMLElement,
    dropdownName: string,
    dropdownId: string,
    { items, pages }: { items: MenuItem[]; pages: UIPage[] },
  ): void {
    this.container = this.ui.createElement("div", {
      class:
        "fixed w-[300px] py-0 px-[10px] bg-[var(--background-color)] text-[var(--text-color)] shadow-[-2px_0_10px_rgba(0,0,0,0.1)] transition-all duration-200 ease-[ease] z-[1000] flex flex-col rounded-lg pt-0 pb-0",
    });
    this.menuTopBar = this.ui.createElement("div", { class: "menu-top-bar" });

    const closeButton = this.ui.createElement(
      "button",
      { class: "close-button" },
      [
        this.ui.createElement("span", { class: "material-symbols-outlined" }, [
          "close",
        ]),
      ],
    );
    closeButton.onclick = () => this.closeMenu();

    this.dropdown = this.ui.createElement("div", {
      class: "dropdown",
      id: dropdownId,
    });
    this.dropdownButton = this.ui.createElement(
      "div",
      { class: "dropdown-button" },
      [
        this.ui.createElement("span", { class: "button-text" }, [dropdownName]),
        this.ui.createElement("span", { class: "material-symbols-outlined" }, [
          "keyboard_arrow_down",
        ]),
      ],
    );

    this.dropdownButton.addEventListener("click", () => {
      const isVisible = this.dropdownOptions!.style.display === "block";
      this.dropdownOptions!.style.display = isVisible ? "none" : "block";
      this.dropdownButton!.classList.toggle("active", !isVisible);
    });

    this.dropdownOptions = this.ui.createElement("ul", {
      class: "dropdown-options",
    });
    items.forEach((item) => {
      const option = this.ui.createElement("li", { "data-id": item.pageId }, [
        item.label,
      ]);
      option.onclick = () => {
        this.showPage(item.pageId);
        const isVisible = this.dropdownOptions!.style.display === "block";
        this.dropdownOptions!.style.display = isVisible ? "none" : "block";
        this.dropdownButton!.classList.toggle("active", !isVisible);
      };
      this.dropdownOptions!.appendChild(option);
    });

    this.dropdown.appendChild(this.dropdownButton);
    this.dropdown.appendChild(this.dropdownOptions);

    this.menuTopBar.appendChild(this.dropdown);
    this.menuTopBar.appendChild(closeButton);
    this.container.appendChild(this.menuTopBar);

    const contentArea = this.ui.createElement("div", { class: "content-area" });
    this.container.appendChild(contentArea);

    pages.forEach((page) => {
      const pageDiv = this.ui.createElement("div", {
        class: "menu-page",
        id: page.id,
        "data-id": page.id,
      });
      pageDiv.innerHTML = page.content;
      this.pages[page.id] = pageDiv;
      contentArea.appendChild(pageDiv);
    });

    Object.values(this.pages).forEach((page) => (page.style.display = "none"));
    if (pages.length > 0) this.showPage(pages[0].id);

    tag.appendChild(this.container);

    setTimeout(() => {
      this.container!.classList.add("visible");
    }, 0);

    document.addEventListener("click", (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".dropdown")) {
        document.querySelectorAll(".dropdown-button.active").forEach((btn) => {
          btn.classList.remove("active");
          const dropdownOptions = btn.nextElementSibling as HTMLElement;
          if (dropdownOptions) dropdownOptions.style.display = "none";
        });
      }
    });
  }

  showPage(pageId: string): void {
    Object.values(this.pages).forEach((page) => (page.style.display = "none"));
    const page = this.pages[pageId];
    if (page) {
      page.style.display = "block";
      this.currentPage = pageId;
    }
  }

  closeMenu(): void {
    this.container!.classList.remove("visible");
    setTimeout(() => {
      if (this.container && document.body.contains(this.container)) {
        document.body.removeChild(this.container);
      }
    }, 300);
  }
}

export { Menu };