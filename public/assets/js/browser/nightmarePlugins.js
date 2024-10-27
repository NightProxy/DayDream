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
        this.isOpen = false;
    }

    attachTo(element, content) {
        if (!element) throw new Error("Please provide a valid element to attach the menu.");

        element.addEventListener("click", (event) => {
            event.stopPropagation();
            this.isOpen ? this.closeMenu() : this.openMenu(element, content);
        });

        // Close the menu when clicking outside
        window.addEventListener("click", () => this.closeMenu());
    }

    openMenu(element, content) {
        if (this.isOpen || !element) return;

        this.container = this.ui.createElement("div", { class: "menu-container" });

        // Append custom content to the menu container
        if (typeof content === "function") {
            // If content is a function, call it to get dynamic elements
            this.container.appendChild(content(this.ui));
        } else if (Array.isArray(content)) {
            // If content is an array, add each item to the container
            content.forEach((item) => this.container.appendChild(item));
        } else if (content instanceof HTMLElement) {
            // If content is a single HTML element
            this.container.appendChild(content);
        }

        // Position the menu relative to the clicked element
        const rect = element.getBoundingClientRect();
        this.container.style.position = "absolute";
        this.container.style.top = `${rect.bottom + window.scrollY}px`;
        this.container.style.left = `${rect.right + window.scrollX}px`;

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