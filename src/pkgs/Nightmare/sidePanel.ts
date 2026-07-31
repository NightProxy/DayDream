class SidePanel implements SidePanelInterface {
  ui: NightmareUI;
  container: HTMLElement | null;
  isOpen: boolean;
  private handlePageClicked: (() => void) | null = null;
  private handleWindowClick: (() => void) | null = null;
  constructor(ui: NightmareUI) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, content);
      this.ui.createIcons();
    });

    if (!this.handlePageClicked) {
      this.handlePageClicked = () => this.closeMenu();
      document.addEventListener("ddx:page.clicked", this.handlePageClicked);
    }

    if (!this.handleWindowClick) {
      this.handleWindowClick = () => this.closeMenu();
      window.addEventListener("click", this.handleWindowClick);
    }
  }

  detach() {
    if (this.handlePageClicked) {
      document.removeEventListener("ddx:page.clicked", this.handlePageClicked);
      this.handlePageClicked = null;
    }

    if (this.handleWindowClick) {
      window.removeEventListener("click", this.handleWindowClick);
      this.handleWindowClick = null;
    }
  }

  openMenu(
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
  ) {
    if (this.isOpen || !element) return;

    this.container = this.ui.createElement("div", { class: "sidepanel" });

    if (typeof content === "function") {
      this.container!.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => this.container!.appendChild(item));
    } else if (content instanceof HTMLElement) {
      this.container!.appendChild(content);
    }

    document.body.appendChild(this.container!);
    this.isOpen = true;
  }

  closeMenu() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.isOpen = false;
  }
}

export { SidePanel };