class History {
    constructor(settings, events) {
        this.settings = settings;
        this.events = events;

        this.historyStore = localforage.createInstance({
            name: "HistoryManager",
            storeName: "history",
        });

        this.historyStack = [];
        this.currentIndex = -1; // Points to the current history state
    }

    async init() {
        const storedHistory = await this.historyStore.getItem("historyStack");
        const storedIndex = await this.historyStore.getItem("currentIndex");

        if (storedHistory && Array.isArray(storedHistory)) {
            this.historyStack = storedHistory;
        }

        if (typeof storedIndex === "number") {
            this.currentIndex = storedIndex;
        }

    }

    async saveState() {
        await this.historyStore.setItem("historyStack", this.historyStack);
        await this.historyStore.setItem("currentIndex", this.currentIndex);
    }

    integrate(iframe) {
        const { contentWindow } = iframe;

        const pushState = (state, title, url) => {
            this.events.emit("history:push", { state, title, url });

            // Remove forward history if navigating
            this.historyStack = this.historyStack.slice(0, this.currentIndex + 1);

            this.historyStack.push({ state, title, url });
            this.currentIndex++;

            this.saveState();
        };

        const replaceState = (state, title, url) => {
            if (this.currentIndex >= 0) {
                this.events.emit("history:replace", { state, title, url });

                this.historyStack[this.currentIndex] = { state, title, url };
                this.saveState();
            }
        };

        contentWindow.history.pushState = pushState.bind(this);
        contentWindow.history.replaceState = replaceState.bind(this);

        contentWindow.history.back = this.back.bind(this, iframe);
        contentWindow.history.forward = this.forward.bind(this, iframe);
        contentWindow.history.go = this.go.bind(this, iframe);
    }

    async back(iframe) {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            const { url } = this.historyStack[this.currentIndex];

            this.events.emit("history:back", { url });

            iframe.contentWindow.location.href = url;

            await this.saveState();
        }
    }

    async forward(iframe) {
        if (this.currentIndex < this.historyStack.length - 1) {
            this.currentIndex++;
            const { url } = this.historyStack[this.currentIndex];

            this.events.emit("history:forward", { url });

            iframe.contentWindow.location.href = url;

            await this.saveState();
        }
    }

    async go(iframe, steps) {
        const newIndex = this.currentIndex + steps;

        if (newIndex >= 0 && newIndex < this.historyStack.length) {
            this.currentIndex = newIndex;
            const { url } = this.historyStack[newIndex];

            this.events.emit("history:go", { url });

            iframe.contentWindow.location.href = url;

            await this.saveState();
        }
    }

    async addPage(state, title, url) {
        this.historyStack.push({ state, title, url });
        this.currentIndex = this.historyStack.length - 1;

        await this.saveState();
    }

    async clearHistory() {
        this.historyStack = [];
        this.currentIndex = -1;

        await this.historyStore.clear();
        this.events.emit("history:clear");
    }
}

export default History;