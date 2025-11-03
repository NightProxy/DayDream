import type { TabsInterface } from "./types";

export class TabPageClient {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  pageClient = (iframe: HTMLIFrameElement): void => {
    this.setupWindowOpenInterceptor(iframe);
    this.setupClickListener(iframe);
    this.setupErrorPageRedirect(iframe);
  };

  private setupWindowOpenInterceptor(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;

    iframe.contentWindow.window.open = (url?: string | URL): Window | null => {
      this.handleWindowOpen(url);
      return null;
    };
  }

  private async handleWindowOpen(url?: string | URL): Promise<void> {
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
  }

  private setupClickListener(iframe: HTMLIFrameElement): void {
    iframe.contentWindow?.document.body.addEventListener("click", () => {
      window.parent.eventsAPI.emit("ddx:page.clicked", null);
    });
  }

  private setupErrorPageRedirect(iframe: HTMLIFrameElement): void {
    iframe.addEventListener("load", () => {
      this.checkForErrorTrace(iframe);
    });
  }

  private checkForErrorTrace(iframe: HTMLIFrameElement): void {
    const currentUrl = iframe.src;

    if (this.isErrorPage(currentUrl)) return;

    const errorTrace = iframe.contentWindow?.document.getElementById(
      "errorTrace",
    ) as HTMLTextAreaElement | null;

    if (errorTrace?.value) {
      this.redirectToErrorPage(iframe, errorTrace.value);
    }
  }

  private isErrorPage(url: string): boolean {
    try {
      const internalUrl = this.tabs.proto.getInternalURL(url);
      return internalUrl === "ddx://error/" || url.includes("/internal/error/");
    } catch {
      return url.includes("/internal/error/");
    }
  }

  private redirectToErrorPage(
    iframe: HTMLIFrameElement,
    errorMessage: string,
  ): void {
    const errorPageHandler = (): void => {
      try {
        const errorTextarea = iframe.contentWindow?.document.getElementById(
          "error-textarea",
        ) as HTMLTextAreaElement | null;

        if (errorTextarea) {
          errorTextarea.value = errorMessage;
        }
      } catch (err) {
        console.error("Failed to populate error textarea:", err);
      } finally {
        iframe.removeEventListener("load", errorPageHandler);
      }
    };

    iframe.addEventListener("load", errorPageHandler);
    this.tabs.proto.navigate("error");
  }
}
