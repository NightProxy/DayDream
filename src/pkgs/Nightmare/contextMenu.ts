class ContextMenu {
  ui: NightmareUI;
  currentMenu: HTMLElement | null = null;

  constructor(ui: NightmareUI) {
    this.ui = ui;
    this.hideMenu = this.hideMenu.bind(this);
  }

  create(
    items: { text: string; action: () => void }[],
    position: { x: number; y: number },
    id: string,
    style: string,
    itemStyle: string,
  ): void {
    this.currentMenu?.remove();

    this.currentMenu = this.ui.createElement(
      "div",
      {
        id,
        style: `position: absolute; top: ${position.y}px; left: ${position.x}px; ${style}`,
      },
      items.map((item) =>
        this.ui.createElement(
          "div",
          { style: `cursor: pointer; ${itemStyle}` },
          [
            this.ui.createElement("button", { onclick: item.action }, [
              item.text,
            ]),
          ],
        ),
      ),
    );

    document.body.appendChild(this.currentMenu);
    document.addEventListener("click", this.hideMenu, { once: true });
  }

  hideMenu(event: MouseEvent): void {
    if (this.currentMenu && !this.currentMenu.contains(event.target as Node)) {
      this.currentMenu.remove();
      this.currentMenu = null;
    } else if (
      this.currentMenu &&
      this.currentMenu.contains(event.target as Node)
    ) {
      document.addEventListener("click", this.hideMenu, { once: true });
    }
  }
}

export { ContextMenu };