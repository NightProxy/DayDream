class IframeClient {
  parentOrigin: string;
  senderId: string;

  constructor() {
    this.parentOrigin = "*";
    this.senderId = `iframeClient-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    window.addEventListener("message", this.handleMessage.bind(this));

    this.notifyReady();
  }

  notifyReady() {
    if (window.parent && window !== window.parent) {
      window.parent.postMessage(
        {
          type: "iframe-client-ready",
          senderId: this.senderId,
        },
        "*",
      );
    }
  }

  handleMessage(event: MessageEvent) {
    const { type, code, html, selector, __senderId } = event.data || {};

    if (__senderId === this.senderId) {
      return;
    }

    switch (type) {
      case "inject-js":
        this.injectJS(code);
        break;
      case "inject-html":
        this.injectHTML(html, selector);
        break;
      case "inject-css":
        this.injectCSS(code);
        break;
      case "eval-js":
        this.evalJS(code);
        break;
    }
  }

  injectJS(code: string) {
    try {
      const script = document.createElement("script");
      script.textContent = code;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (error) {
      console.error("Failed to inject JS:", error);
    }
  }

  injectHTML(html: string, selector?: string) {
    try {
      const target = selector
        ? document.querySelector(selector)
        : document.body;
      if (target) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        while (wrapper.firstChild) {
          target.appendChild(wrapper.firstChild);
        }
      }
    } catch (error) {
      console.error("Failed to inject HTML:", error);
    }
  }

  injectCSS(code: string) {
    try {
      const style = document.createElement("style");
      style.textContent = code;
      (document.head || document.documentElement).appendChild(style);
    } catch (error) {
      console.error("Failed to inject CSS:", error);
    }
  }

  evalJS(code: string) {
    try {
      const result = eval(code);
      if (window.parent && window !== window.parent) {
        window.parent.postMessage(
          {
            type: "eval-result",
            result: result,
            senderId: this.senderId,
          },
          "*",
        );
      }
      return result;
    } catch (error) {
      console.error("Failed to eval JS:", error);
      if (window.parent && window !== window.parent) {
        window.parent.postMessage(
          {
            type: "eval-error",
            error: error instanceof Error ? error.message : String(error),
            senderId: this.senderId,
          },
          "*",
        );
      }
    }
  }
}

export { IframeClient };
