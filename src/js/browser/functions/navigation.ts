import { NavigationInterface } from "./types";
import { Items } from "@browser/items";

export class Navigation implements NavigationInterface {
  private items: Items;
  private zoomLevel: number;
  private zoomSteps: Array<number>;
  private currentStep: number;

  constructor(
    items: Items,
    zoomSteps: Array<number>,
    currentStep: number,
  ) {
    this.items = items;
    
    if (!Array.isArray(zoomSteps) || zoomSteps.length === 0 || !zoomSteps.every(n => typeof n === 'number' && !isNaN(n))) {
      console.warn("Invalid zoomSteps provided, using default [1]");
      this.zoomSteps = [1];
    } else {
      this.zoomSteps = zoomSteps;
    }
    
    this.currentStep = Math.max(0, Math.min(currentStep, this.zoomSteps.length - 1));
    this.zoomLevel = this.zoomSteps[this.currentStep] || 1;
  }

  backward(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (iframe?.contentWindow?.history) {
      try {
        iframe.contentWindow.history.back();

        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              action: "back",
              fromNavigation: true,
            },
          }),
        );
      } catch (error) {
        console.warn("Could not navigate back:", error);
      }
    }
  }

  forward(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (iframe?.contentWindow?.history) {
      try {
        iframe.contentWindow.history.forward();

        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              action: "forward",
              fromNavigation: true,
            },
          }),
        );
      } catch (error) {
        console.warn("Could not navigate forward:", error);
      }
    }
  }

  refresh(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (iframe?.contentWindow?.location) {
      try {
        iframe.contentWindow.location.reload();

        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              action: "refresh",
              fromNavigation: true,
            },
          }),
        );
      } catch (error) {
        console.warn("Could not refresh:", error);
      }
    }
  }

  zoomIn(): void {
    if (this.zoomSteps.length === 0) {
      console.warn("Cannot zoom: zoomSteps is empty");
      return;
    }

    const targetStep = this.currentStep + 1;
    if (targetStep < this.zoomSteps.length) {
      this.currentStep = targetStep;
      const newZoomLevel = this.zoomSteps[this.currentStep];
      
      if (typeof newZoomLevel === 'number' && !isNaN(newZoomLevel)) {
        this.zoomLevel = newZoomLevel;
        this.scaleIframeContent();
      } else {
        console.warn("Invalid zoom level at step", this.currentStep);
      }
    }
  }

  zoomOut(): void {
    if (this.zoomSteps.length === 0) {
      console.warn("Cannot zoom: zoomSteps is empty");
      return;
    }

    const targetStep = this.currentStep - 1;
    if (targetStep >= 0) {
      this.currentStep = targetStep;
      const newZoomLevel = this.zoomSteps[this.currentStep];
      
      if (typeof newZoomLevel === 'number' && !isNaN(newZoomLevel)) {
        this.zoomLevel = newZoomLevel;
        this.scaleIframeContent();
      } else {
        console.warn("Invalid zoom level at step", this.currentStep);
      }
    }
  }

  scaleIframeContent(): void {
    if (typeof this.zoomLevel !== 'number' || isNaN(this.zoomLevel)) {
      console.warn("Cannot scale: invalid zoom level", this.zoomLevel);
      return;
    }

    const iframe = document.querySelector("iframe.active") as HTMLIFrameElement | null;
    if (!iframe) {
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (!iframeDoc || !iframeDoc.body) {
        return;
      }

      iframeDoc.body.style.transform = `scale(${this.zoomLevel})`;
      iframeDoc.body.style.transformOrigin = "top left";
      iframeDoc.body.style.overflow = "auto";
    } catch (error) {
      if (error instanceof DOMException) {
        console.warn("Cannot scale iframe content: cross-origin access blocked");
      } else {
        console.warn("Cannot scale iframe content:", error);
      }
    }
  }

  goFullscreen(): void {
    const iframe = document.querySelector("iframe.active") as HTMLIFrameElement | null;

    if (!iframe) {
      console.warn("No active iframe found for fullscreen");
      return;
    }

    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if ((iframe as any).mozRequestFullScreen) {
      (iframe as any).mozRequestFullScreen();
    } else if ((iframe as any).webkitRequestFullscreen) {
      (iframe as any).webkitRequestFullscreen();
    } else if ((iframe as any).msRequestFullscreen) {
      (iframe as any).msRequestFullscreen();
    }
  }

  getCurrentZoomLevel(): number {
    return this.zoomLevel;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  updateZoomState(zoomLevel: number, currentStep: number): void {
    this.zoomLevel = zoomLevel;
    this.currentStep = currentStep;
  }
}
