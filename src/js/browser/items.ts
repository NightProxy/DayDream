import { Nightmare } from "@libs/Nightmare/nightmare";

class Items {
  ui: Nightmare;
  navbar: HTMLDivElement | null;
  utilityBar: HTMLDivElement | null;
  topBar: HTMLDivElement | null;
  tabBar: HTMLDivElement | null;
  homeButton: HTMLButtonElement | null;
  backButton: HTMLButtonElement | null;
  reloadButton: HTMLButtonElement | null;
  forwardButton: HTMLButtonElement | null;
  get addressBar(): HTMLInputElement | null {
    return document.querySelector('[component="address-bar"]') as HTMLInputElement;
  }
  bookmarkButton: HTMLButtonElement | null;
  extensionsButton: HTMLButtonElement | null;
  profilesButton: HTMLButtonElement | null;
  extrasButton: HTMLButtonElement | null;
  menuContent: HTMLDivElement | null;
  newTab: HTMLButtonElement | null;
  frameContainer: HTMLDivElement | null;
  activeFrame: HTMLIFrameElement | null;

  constructor() {
    this.ui = new Nightmare();
    this.navbar = this.ui.queryComponent("navbar") as HTMLDivElement;
    this.utilityBar = this.ui.queryComponent("utility-bar") as HTMLDivElement;
    this.topBar = this.ui.queryComponent("top-bar") as HTMLDivElement;
    this.tabBar = this.ui.queryComponent(
      "tab-bar",
      this.topBar,
    ) as HTMLDivElement;
    this.homeButton = this.ui.queryComponent(
      "home",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.backButton = this.ui.queryComponent(
      "back",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.reloadButton = this.ui.queryComponent(
      "reload",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.forwardButton = this.ui.queryComponent(
      "forward",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.bookmarkButton = this.ui.queryComponent(
      "bookmark",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.extensionsButton = this.ui.queryComponent(
      "extensions",
      this.navbar,
    ) as HTMLButtonElement;
    this.profilesButton = this.ui.queryComponent(
      "profiles",
      this.topBar,
    ) as HTMLButtonElement;
    this.extrasButton = this.ui.queryComponent(
      "menu",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.menuContent = this.ui.queryComponent(
      "menu-content",
      this.utilityBar,
    ) as HTMLDivElement;
    this.newTab = this.ui.queryComponent(
      "new-tab",
      this.topBar,
    ) as HTMLButtonElement;
    this.frameContainer = this.ui.queryComponent(
      "frame-container",
    ) as HTMLDivElement;
    this.activeFrame = this.frameContainer?.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
  }
}

export { Items };
