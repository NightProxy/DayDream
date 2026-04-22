class RightClickMenu implements RightClickMenuInterface {
  ui: NightmareUI;
  container: HTMLElement | null;
  isOpen: boolean;
  globalListenersAttached: boolean = false;
  constructor(ui: NightmareUI) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(
    element: HTMLElement,
    content: Function | HTMLElement | HTMLElement[],
  ) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, event, content);
    });

    if (!this.globalListenersAttached) {
      document.addEventListener("ddx:page.clicked", () => this.closeMenu());
      window.addEventListener("click", () => this.closeMenu());
      this.globalListenersAttached = true;
    }
  }

  openMenu(
    element: HTMLElement,
    event: MouseEvent,
    content: Function | HTMLElement | HTMLElement[],
  ) {
    if (this.isOpen || !element) return;

    this.container = this.ui.createElement("div", {
      class: "click-menu-container",
    });

    if (typeof content === "function") {
      this.container!.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => {
        this.container!.appendChild(item);
      });
    } else if (content instanceof HTMLElement) {
      this.container!.appendChild(content);
    }

    this.container!.style.top = `${event.pageY}px`;
    this.container!.style.left = `${event.pageX}px`;

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

export { RightClickMenu };