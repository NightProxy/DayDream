class NightmarePlugins {
  constructor(ui) {
    this.ui = ui;
    this.notification = new Notification(ui);
    this.sidemenu = new SideMenu(ui);
    this.sidepanel = new SidePanel(ui);
    this.rightclickmenu = new RightClickMenu(ui);
  }
}

class SideMenu {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(element, content) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, content);
    });

    window.addEventListener("click", () => this.closeMenu());
  }

  openMenu(element, content) {
    if (this.isOpen || !element) return;

    this.container = this.ui.createElement("div", { class: "menu-container" });

    if (typeof content === "function") {
      this.container.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => this.container.appendChild(item));
    } else if (content instanceof HTMLElement) {
      this.container.appendChild(content);
    }

    
    const rect = element.getBoundingClientRect();
    this.container.style.top = `${rect.bottom + window.scrollY}px`;
    this.container.style.left = `${rect.left + rect.width + window.scrollX - 300}px`;

    
    this.container.style.opacity = "0";
    this.container.style.filter = "blur(5px)";

    document.body.appendChild(this.container);
    this.isOpen = true;

    
    setTimeout(() => {
      this.container.style.opacity = "1";
      this.container.style.filter = "blur(0px)";
    }, 10);
  }

  closeMenu() {
    if (this.container) {
      
      this.container.style.opacity = "0";
      this.container.style.filter = "blur(5px)";
      setTimeout(() => {
        if (this.container) {
          this.container.remove();
          this.container = null;
        }
      }, 200);
    }
    this.isOpen = false;
  }
}


class SidePanel {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(element, content) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, content);
    });

    window.addEventListener("click", () => this.closeMenu());
  }

  openMenu(element, content) {
    if (this.isOpen || !element) return;

    this.container = this.ui.createElement("div", { class: "sidepanel" });

    if (typeof content === "function") {
      this.container.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => this.container.appendChild(item));
    } else if (content instanceof HTMLElement) {
      this.container.appendChild(content);
    }

    document.body.appendChild(this.container);
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

class Notification {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;

    this.elements = {
      container: {
        tag: "div",
        attributes: { class: "notification-container" },
      },
      header: {
        tag: "div",
        attributes: { class: "notification-header" },
        children: [
          this.ui.createElement("span", { class: "notification-title" }, [
            "Notifications",
          ]),
          this.ui.createElement("button", { class: "close-button" }, [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["close"],
            ),
          ]),
        ],
      },
      list: {
        tag: "ul",
        attributes: { class: "notification-list" },
      },
      item: {
        tag: "li",
        attributes: { class: "notification-item" },
      },
    };
  }

  createNotification(tag, notifications) {
    this.container = this.ui.createElement(
      this.elements.container.tag,
      this.elements.container.attributes,
    );

    const header = this.ui.createElement(
      this.elements.header.tag,
      this.elements.header.attributes,
      this.elements.header.children,
    );
    header.querySelector(".close-button").addEventListener("click", () => {
      this.closeNotification();
    });

    this.container.appendChild(header);

    const list = this.ui.createElement(
      this.elements.list.tag,
      this.elements.list.attributes,
    );
    notifications.forEach((notification) => {
      const item = this.ui.createElement(
        this.elements.item.tag,
        this.elements.item.attributes,
        [notification.message],
      );
      list.appendChild(item);
    });

    this.container.appendChild(list);

    tag.appendChild(this.container);

    this.isOpen = true;
  }

  closeNotification() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.isOpen = false;
  }
}

class RightClickMenu {
  constructor(ui) {
    this.ui = ui;
    this.container = null;
    this.isOpen = false;
  }

  attachTo(element, content) {
    if (!element)
      throw new Error("Please provide a valid element to attach the menu.");

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu(element, event, content);
    });

    window.addEventListener("click", () => this.closeMenu());
  }

  openMenu(element, event, content) {
    if (this.isOpen || !element) return;

    this.container = this.ui.createElement("div", { class: "click-menu-container" });

    if (typeof content === "function") {
      this.container.appendChild(content(this.ui));
    } else if (Array.isArray(content)) {
      content.forEach((item) => {
        this.container.appendChild(item);
      });
    } else if (content instanceof HTMLElement) {
      this.container.appendChild(content);
    }

    this.container.style.top = `${event.pageY}px`;
    this.container.style.left = `${event.pageX}px`;

    document.body.appendChild(this.container);
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
