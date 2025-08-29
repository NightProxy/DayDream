import type { TabsInterface } from "./types";

export class TabPageClient {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  pageClient = (iframe: HTMLIFrameElement) => {
    iframe.contentWindow!.window.open = (url?: string | URL): Window | null => {
      (async () => {
        try {
          if (!url) return;

          const urlString = url instanceof URL ? url.href : url.toString();
          console.log("Opening new tab with URL:", urlString);

          await this.tabs.createTab(urlString);

          this.tabs.logger.createLog(
            `New tab opened via window.open: ${urlString}`,
          );
        } catch (error) {
          console.error("Error opening new tab via window.open:", error);
        }
      })();

      return null;
    };

    iframe.contentWindow?.document.body.addEventListener("click", async () => {
      window.parent.eventsAPI.emit("ddx:page.clicked", null);
    });
  };
}
