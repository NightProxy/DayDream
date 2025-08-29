import { NavigationInterface } from "./types";
import { Items } from "@browser/items";

export class Navigation implements NavigationInterface {
  private items: Items;
  private zoomLevel: number;
  private zoomSteps: Array<number>;
  private currentStep: number;

  constructor(
    items: Items,
    zoomLevel: number,
    zoomSteps: Array<number>,
    currentStep: number,
  ) {
    this.items = items;
    this.zoomLevel = zoomLevel;
    this.zoomSteps = zoomSteps;
    this.currentStep = currentStep;
  }

  backward(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.back();
  }

  forward(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.history.forward();
  }

  refresh(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    iframe?.contentWindow?.location.reload();
  }

  zoomIn(): void {
    if (this.currentStep < this.zoomSteps.length - 1) {
      this.currentStep++;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  zoomOut(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
    this.zoomLevel = this.zoomSteps[this.currentStep];
    this.scaleIframeContent();
  }

  scaleIframeContent(): void {
    let iframe: HTMLIFrameElement | null;
    iframe = document.querySelector("iframe.active");
    if (iframe) {
      const iframeDoc =
        iframe?.contentDocument || iframe?.contentWindow?.document;
      iframeDoc!.body.style.transform = `scale(${this.zoomLevel})`;
      iframeDoc!.body.style.transformOrigin = "top left";
      iframeDoc!.body.style.overflow = "auto";
    }
  }

  goFullscreen(): void {
    const iframe = document.querySelector("iframe.active") as HTMLIFrameElement;

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
