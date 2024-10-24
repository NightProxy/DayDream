class NightmarePlugins {
    constructor(ui) {
        this.ui = ui;
        this.notification = new Notification(ui);
        this.sidemenu = new SideMenu(ui);
    }
}

class SideMenu {
    constructor(ui) {
        this.ui = ui;
        this.container = null;
        this.button = null;
        this.isOpen = false;
    }

    createMenu(tag, className, menuElement, menuTag) {
        this.button = this.ui.createElement("button", { class:  className}, [
            this.ui.createElement("span", { class: "material-symbols-outlined" }, [
                "more_vert",
            ]),
        ]);
        this.button.addEventListener("click", () => {
            if (this.isOpen) {
                this.closeMenu();
            } else {
                this.openMenu(menuElement, menuTag);
            }
        });

        tag.appendChild(this.button);
    }

    openMenu(menuElement, menuTag) {
        this.container = this.ui.createElement("div", { class: "side-menu-container" });

        const header = this.ui.createElement("div", { class: "side-menu-header" }, [
            this.ui.createElement("span", { class: "side-menu-title" }, ["Menu"]),
        ]);
        this.container.appendChild(header);

        this.container.appendChild(menuElement);

        const footer = this.ui.createElement("div", { class: "side-menu-footer" }, [
            this.ui.createElement("button", { class: "side-menu-button" }, ["Close"]),
        ]);
        footer.querySelector("button").addEventListener("click", () => {
            this.closeMenu();
        });
        this.container.appendChild(footer);

        this.container.style.top = `${this.button.getBoundingClientRect().top}px`;
        this.container.style.left = `${this.button.getBoundingClientRect().right}px`;

        menuTag.appendChild(this.container);

        this.isOpen = true;

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".side-menu-button, .side-menu-container")) {
                this.closeMenu();
            }
        });
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
                        this.ui.createElement("span", { class: "material-symbols-outlined" }, [
                            "close",
                        ]),
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