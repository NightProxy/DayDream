import { MenuInterface } from "./types";
import { Items } from "@browser/items";
import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { NightmarePlugins } from "@browser/nightmarePlugins";

export class MenuManager implements MenuInterface {
  private items: Items;
  private ui: UI;
  private nightmarePlugins: NightmarePlugins;

  constructor(items: Items, ui: UI, nightmarePlugins: NightmarePlugins) {
    this.items = items;
    this.ui = ui;
    this.nightmarePlugins = nightmarePlugins;
  }

  menus(): void {
    const menuBtn = this.items.extrasButton;
    const menuPopup = this.items.menuContent;

    if (menuBtn && menuPopup) {
      menuPopup.style.transition = "opacity .18s ease, transform .18s ease";

      const openMenu = () => {
        menuPopup.style.pointerEvents = "auto";
        menuPopup.style.opacity = "1";
        menuPopup.style.transform = "scale(1)";
        menuPopup.style.zIndex = "99999999";
        menuPopup.style.willChange = "opacity, transform";
      };

      const closeMenu = () => {
        menuPopup.style.opacity = "0";
        menuPopup.style.transform = "scale(.95)";
        setTimeout(() => {
          menuPopup.style.pointerEvents = "none";
        }, 180);
      };

      closeMenu();

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = menuPopup.style.opacity === "1";
        open ? closeMenu() : openMenu();
      });

      menuPopup.querySelectorAll("li").forEach((item) => {
        item.addEventListener("click", () => {
          closeMenu();
        });
      });

      document.addEventListener("click", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });

      document.addEventListener("ddx:page.clicked", (e) => {
        if (!menuPopup.contains(e.target as Node) && e.target !== menuBtn)
          closeMenu();
      });
    }
  }

  extensionsMenu(button: HTMLButtonElement): void {
    const content = this.ui.createElement("div", {}, [
      this.ui.createElement("div", { class: "menu-row" }, [
        this.ui.createElement("span", { style: "margin: 0px 20px;" }, [
          "Extensions (SOON)",
        ]),
        this.ui.createElement("div", { class: "menu-right" }, [
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "reloadExtensions",
              onclick: () => {
                console.log("Reloading extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["refresh"],
              ),
            ],
          ),
          this.ui.createElement(
            "div",
            {
              class: "menu-item",
              id: "extensionsSettings",
              onclick: () => {
                console.log("Disabling all extensions");
              },
            },
            [
              this.ui.createElement(
                "span",
                { class: "material-symbols-outlined" },
                ["settings"],
              ),
            ],
          ),
        ]),
      ]),
    ]);

    this.nightmarePlugins.sidemenu.attachTo(button, content, 300);
  }
}
