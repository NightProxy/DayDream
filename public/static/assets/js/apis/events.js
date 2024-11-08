class EventSystem {
  constructor() {
    this.eventListeners = {};
    this.channel = new BroadcastChannel("global-events");

    window.addEventListener("message", this.handleMessage.bind(this));
    this.channel.addEventListener("message", this.handleBroadcast.bind(this));
  }

  emit(eventName, data) {
    this.dispatchEvent(eventName, data);

    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.contentWindow.postMessage({ eventName, data }, "*");
    });

    if (window.parent && window !== window.parent) {
      window.parent.postMessage({ eventName, data }, "*");
    }

    this.channel.postMessage({ eventName, data });

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ eventName, data });
    }
  }

  handleMessage(event) {
    const { eventName, data } = event.data || {};
    if (eventName) {
      this.dispatchEvent(eventName, data);
    }
  }

  handleBroadcast(event) {
    const { eventName, data } = event.data || {};
    if (eventName) {
      this.dispatchEvent(eventName, data);
    }
  }

  addEventListener(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
    document.addEventListener(eventName, callback);
  }

  removeEventListener(eventName, callback) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName] = this.eventListeners[eventName].filter(
        (cb) => cb !== callback,
      );
      document.removeEventListener(eventName, callback);
    }
  }

  dispatchEvent(eventName, data) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach((callback) => callback(data));
    }
    document.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  }
}
