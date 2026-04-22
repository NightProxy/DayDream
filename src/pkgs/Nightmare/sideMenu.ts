class SideMenu implements SideMenuInterface {
  ui: NightmareUI;
  container: HTMLElement | null;
  isOpen: boolean;
  private closeTimeout: number | null = null;
  private handlePageClicked: (() => void) | null = null;
  private handleWindowClick: (() => void) | null = null;
  private elementClickHandlers: WeakMap<
    HTMLElement,
    (event: MouseEvent) => void
  > = new WeakMap();
  constructor(ui: NightmareUI) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(
    element: HTMLButtonElement,
    content: Function | HTMLElement | HTMLElement[],
    offset: number = 0,
  ) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    const existingHandler = this.elementClickHandlers.get(element);
    if (existingHandler) {
      element.removeEventListener("click", existingHandler);
    }

    const clickHandler = (event: MouseEvent) => {
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, content, offset);
      this.ui.createIcons();
    };

    this.elementClickHandlers.set(element, clickHandler);
    element.addEventListener("click", clickHandler);

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
    offset: number = 0,
  ) {
    if (this.isOpen || !element) return;

    if (this.closeTimeout !== null) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }

    this.container = this.ui.createElement("div", { class: "menu-container" });

    if (typeof content === "function") {
      this.container!.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => this.container!.appendChild(item));
    } else if (content instanceof HTMLElement) {
      this.container!.appendChild(content);
    }

    const rect = element.getBoundingClientRect();
    this.container!.style.top = `${rect.bottom + window.scrollY}px`;
    this.container!.style.left = `${rect.left + rect.width + window.scrollX - offset}px`;

    this.container!.style.opacity = "0";
    this.container!.style.filter = "blur(5px)";

    document.body.appendChild(this.container!);
    this.isOpen = true;

    setTimeout(() => {
      this.container!.style.opacity = "1";
      this.container!.style.filter = "blur(0px)";
    }, 10);
  }

  closeMenu() {
    if (this.closeTimeout !== null) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }

    if (this.container) {
      const containerToRemove = this.container;
      this.container.style.opacity = "0";
      this.container.style.filter = "blur(5px)";
      this.closeTimeout = window.setTimeout(() => {
        if (containerToRemove && containerToRemove.parentNode) {
          containerToRemove.remove();
        }
        if (this.container === containerToRemove) {
          this.container = null;
        }
        this.closeTimeout = null;
      }, 200);
    }
    this.isOpen = false;
  }
}

export { SideMenu };