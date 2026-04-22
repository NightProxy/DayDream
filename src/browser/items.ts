class Items {
  navbar: HTMLDivElement | null;
  utilityBar: HTMLDivElement | null;
  topBar: HTMLDivElement | null;
  tabBar: HTMLDivElement | null;
  homeButton: HTMLButtonElement | null;
  backButton: HTMLButtonElement | null;
  reloadButton: HTMLButtonElement | null;
  forwardButton: HTMLButtonElement | null;
  get addressBar(): HTMLInputElement | null {
    return window.d.querySelector(
      '[data-component="address-bar"]',
    ) as HTMLInputElement;
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
    this.navbar = this.queryComponent("navbar") as HTMLDivElement;
    this.utilityBar = this.queryComponent("utility-bar") as HTMLDivElement;
    this.topBar = this.queryComponent("top-bar") as HTMLDivElement;
    this.tabBar = this.queryComponent(
      "tab-bar",
      this.topBar,
    ) as HTMLDivElement;
    this.homeButton = this.queryComponent(
      "home",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.backButton = this.queryComponent(
      "back",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.reloadButton = this.queryComponent(
      "reload",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.forwardButton = this.queryComponent(
      "forward",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.bookmarkButton = this.queryComponent(
      "bookmark",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.extensionsButton = this.queryComponent(
      "extensions",
      this.navbar,
    ) as HTMLButtonElement;
    this.profilesButton = this.queryComponent(
      "profiles",
      this.topBar,
    ) as HTMLButtonElement;
    this.extrasButton = this.queryComponent(
      "menu",
      this.utilityBar,
    ) as HTMLButtonElement;
    this.menuContent = this.queryComponent(
      "menu-content",
      this.utilityBar,
    ) as HTMLDivElement;
    this.newTab = this.queryComponent(
      "new-tab",
      this.topBar,
    ) as HTMLButtonElement;
    this.frameContainer = this.queryComponent(
      "frame-container",
    ) as HTMLDivElement;
    this.activeFrame = this.frameContainer?.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
  }
  queryComponent(
    componentName: string,
    el: HTMLElement | ShadowRoot = window.d,
  ): HTMLElement | null {
    return el.querySelector(`[data-component="${componentName}"]`);
  }

  queryComponentAll(
    componentName: string,
    el: HTMLElement | ShadowRoot = window.d,
  ): NodeListOf<HTMLElement> {
    return el.querySelectorAll(`[data-component="${componentName}"]`);
  }

}

export { Items };
