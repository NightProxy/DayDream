class codeInject {
  eventListeners: Map<string, Array<EventListenerOrEventListenerObject>>;
  channel: BroadcastChannel;
  senderId: string;
  iframeClients: Map<HTMLIFrameElement, boolean>;

  constructor() {
    this.eventListeners = new Map();
    this.channel = new BroadcastChannel("codeInjectChannel");
    this.senderId = `codeInjector-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.iframeClients = new Map();

    window.addEventListener("message", this.handleMessage.bind(this));
    this.channel.addEventListener("message", this.handleBroadcast.bind(this));
  }

  emit(eventName: string, data: any) {
    this.dispatchEvent(eventName, data);

    const message = {
      eventName,
      data,
      __senderId: this.senderId,
    };

    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.contentWindow!.postMessage(message, "*");
    });

    if (window.parent && window !== window.parent) {
      window.parent.postMessage(message, "*");
    }

    this.channel.postMessage(message);
  }

  handleMessage(event: any) {
    const { eventName, data, __senderId, type } = event.data || {};

    if (__senderId && __senderId === this.senderId) {
      return;
    }

    if (type === "iframe-client-ready") {
      const iframe = Array.from(document.querySelectorAll("iframe")).find(
        (iframe) => iframe.contentWindow === event.source,
      );
      if (iframe) {
        this.iframeClients.set(iframe, true);
      }
    }

    if (eventName) {
      this.dispatchEvent(eventName, data);
    }
  }

  handleBroadcast(event: any) {
    const { eventName, data, __senderId } = event.data || {};

    if (__senderId && __senderId === this.senderId) {
      return;
    }

    if (eventName) {
      this.dispatchEvent(eventName, data);
    }
  }

  addEventListener(
    eventName: string,
    callback: EventListenerOrEventListenerObject,
  ) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)!.push(callback);
    document.addEventListener(eventName, callback);
  }

  removeEventListener(
    eventName: string,
    callback: EventListenerOrEventListenerObject,
  ) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      this.eventListeners.set(
        eventName,
        listeners.filter((cb: any) => cb !== callback),
      );
      document.removeEventListener(eventName, callback);
    }
  }

  dispatchEvent(eventName: string, data: any) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((callback) => {
        if (typeof callback === "function") {
          callback(data);
        } else {
          callback.handleEvent(data);
        }
      });
    }

    document.dispatchEvent(new CustomEvent(eventName, { detail: data || {} }));
  }

  injectToIframe(
    iframe: HTMLIFrameElement,
    type: "inject-js" | "inject-html" | "inject-css" | "eval-js",
    payload: { code?: string; html?: string; selector?: string },
  ) {
    if (!iframe.contentWindow) {
      console.error("Iframe contentWindow is not accessible");
      return;
    }

    const message = {
      type,
      ...payload,
      __senderId: this.senderId,
    };

    iframe.contentWindow.postMessage(message, "*");
  }

  injectJS(iframe: HTMLIFrameElement, code: string) {
    this.injectToIframe(iframe, "inject-js", { code });
  }

  injectHTML(iframe: HTMLIFrameElement, html: string, selector?: string) {
    this.injectToIframe(iframe, "inject-html", { html, selector });
  }

  injectCSS(iframe: HTMLIFrameElement, code: string) {
    this.injectToIframe(iframe, "inject-css", { code });
  }

  evalJS(iframe: HTMLIFrameElement, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Eval timeout"));
      }, 5000);

      const handler = (event: MessageEvent) => {
        const { type, result, error, senderId } = event.data || {};

        if (event.source === iframe.contentWindow) {
          if (type === "eval-result") {
            cleanup();
            resolve(result);
          } else if (type === "eval-error") {
            cleanup();
            reject(new Error(error));
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
      };

      window.addEventListener("message", handler);
      this.injectToIframe(iframe, "eval-js", { code });
    });
  }

  waitForIframeClient(
    iframe: HTMLIFrameElement,
    timeout = 5000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.iframeClients.has(iframe)) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Iframe client timeout"));
      }, timeout);

      const checkInterval = setInterval(() => {
        if (this.iframeClients.has(iframe)) {
          cleanup();
          resolve();
        }
      }, 100);

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(checkInterval);
      };
    });
  }

  removeIframeClient(iframe: HTMLIFrameElement): void {
    this.iframeClients.delete(iframe);
  }

  destroy(): void {
    this.eventListeners.clear();
    this.iframeClients.clear();
    this.channel.close();
  }
}

export { codeInject };
