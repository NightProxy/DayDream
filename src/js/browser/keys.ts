import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";

interface keysInterface {
  keys: any;
  tabs: any;
  functions: any;
  settings: SettingsAPI;
  events: EventSystem;
}

class Keys implements keysInterface {
  keys: any;
  tabs: any;
  functions: any;
  settings: SettingsAPI;
  events: EventSystem;
  constructor(tabs: any, functions: any) {
    this.keys = [];
    this.tabs = tabs;
    this.functions = functions;
    this.settings = new SettingsAPI();
    this.events = new EventSystem();
  }

  init() {
    window.addEventListener("keydown", async (event) => {
      if (event.altKey && event.key === "t") {
        this.tabs.createTab("daydream://newtab");
      } else if (event.ctrlKey && event.key === "t") {
        event.preventDefault();
        this.tabs.createTab("daydream://newtab");
      } else if (event.altKey && event.key === "w") {
        this.tabs.closeCurrentTab();
      } else if (event.altKey && event.key === "ArrowLeft") {
        const activeIframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement;
        if (activeIframe) {
          activeIframe?.contentWindow?.history.back();
        }
        // Go Next
      } else if (event.altKey && event.key === "ArrowRight") {
        const activeIframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement;
        if (activeIframe) {
          activeIframe?.contentWindow?.history.forward();
        }
        // Reload page
      } else if (event.altKey && event.key === "r") {
        const activeIframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement;
        if (activeIframe) {
          activeIframe?.contentWindow?.location.reload();
        }
      } else if (event.altKey && event.keyCode === 116) {
        const activeIframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement;
        if (activeIframe) {
          activeIframe?.contentWindow?.location.reload();
        }
      } else if (event.altKey && event.shiftKey && event.key === "I") {
        event.preventDefault();
        const activeIframe = document.querySelector(
          "iframe.active",
        ) as HTMLIFrameElement;
        if (activeIframe) {
          this.functions.inspectElement();
        }
      }
    });
    /*const iframes = document.querySelectorAll(".iframe-container iframe");
    iframes.forEach((iframe) => {
      iframe.contentWindow.addEventListener("keydown", async (event) => {
        
      });
    });*/
  }
}

export { Keys };
