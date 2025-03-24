interface HistoryState {
  state: any;
  title: string;
  url: string;
}

interface HistorySettings {
  // define any settings properties here
  // for now im keeping it as an empty interface since i couldnt infer anything
}

interface EventEmitter {
  emit(event: string, data: any): void;
}

class History {
  private settings: HistorySettings;
  private events: EventEmitter;
  private historyStore: LocalForage;
  private historyStack: HistoryState[];
  private currentIndex: number; 

  constructor(settings: HistorySettings, events: EventEmitter) {
    this.settings = settings;
    this.events = events;
    this.historyStore = localforage.createInstance({
      name: "HistoryManager",
      storeName: "history",
    });
    this.historyStack = [];
    this.currentIndex = -1; 
  }

  async init(): Promise<void> {
    const storedHistory = await this.historyStore.getItem<HistoryState[]>("historyStack");
    const storedIndex = await this.historyStore.getItem<number>("currentIndex");
    if (storedHistory && Array.isArray(storedHistory)) {
      this.historyStack = storedHistory;
    }
    if (typeof storedIndex === "number") {
      this.currentIndex = storedIndex;
    }
  }

  async saveState(): Promise<void> {
    await this.historyStore.setItem("historyStack", this.historyStack);
    await this.historyStore.setItem("currentIndex", this.currentIndex);
  }

  integrate(iframe: HTMLIFrameElement): void {
    const { contentWindow } = iframe;
    
    if (!contentWindow) {
      throw new Error("Iframe contentWindow is not available");
    }

    const pushState = (state: any, title: string, url: string): void => {
      this.events.emit("history:push", { state, title, url });
      this.historyStack = this.historyStack.slice(0, this.currentIndex + 1);
      this.historyStack.push({ state, title, url });
      this.currentIndex++;
      this.saveState();
    };

    const replaceState = (state: any, title: string, url: string): void => {
      if (this.currentIndex >= 0) {
        this.events.emit("history:replace", { state, title, url });
        this.historyStack[this.currentIndex] = { state, title, url };
        this.saveState();
      }
    };

    contentWindow.history.pushState = pushState.bind(this);
    contentWindow.history.replaceState = replaceState.bind(this);
    contentWindow.history.back = () => this.back(iframe);
    contentWindow.history.forward = () => this.forward(iframe);
    contentWindow.history.go = (steps: number) => this.go(iframe, steps);
  }

  async back(iframe: HTMLIFrameElement): Promise<void> {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      const { url } = this.historyStack[this.currentIndex];
      this.events.emit("history:back", { url });
      
      if (iframe.contentWindow) {
        iframe.contentWindow.location.href = url;
      }
      
      await this.saveState();
    }
  }

  async forward(iframe: HTMLIFrameElement): Promise<void> {
    if (this.currentIndex < this.historyStack.length - 1) {
      this.currentIndex++;
      const { url } = this.historyStack[this.currentIndex];
      this.events.emit("history:forward", { url });
      
      if (iframe.contentWindow) {
        iframe.contentWindow.location.href = url;
      }
      
      await this.saveState();
    }
  }

  async go(iframe: HTMLIFrameElement, steps: number): Promise<void> {
    const newIndex = this.currentIndex + steps;
    if (newIndex >= 0 && newIndex < this.historyStack.length) {
      this.currentIndex = newIndex;
      const { url } = this.historyStack[newIndex];
      this.events.emit("history:go", { url });
      
      if (iframe.contentWindow) {
        iframe.contentWindow.location.href = url;
      }
      
      await this.saveState();
    }
  }

  async addPage(state: any, title: string, url: string): Promise<void> {
    this.historyStack.push({ state, title, url });
    this.currentIndex = this.historyStack.length - 1;
    await this.saveState();
  }

  async clearHistory(): Promise<void> {
    this.historyStack = [];
    this.currentIndex = -1;
    await this.historyStore.clear();
    this.events.emit("history:clear", {});
  }
}

// Add declaration for localforage to make TypeScript happy
declare const localforage: {
  createInstance(config: { name: string; storeName: string }): LocalForage;
};

interface LocalForage {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  clear(): Promise<void>;
}

export default History;