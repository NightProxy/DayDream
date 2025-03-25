interface ItemsInterface {
  toggleTabsButton: HTMLElement | null;
  homeButton: HTMLElement | null;
  backButton: HTMLElement | null;
  reloadButton: HTMLElement | null;
  forwardButton: HTMLElement | null;
  addressBar: HTMLElement | null;
  bookmarkButton: HTMLElement | null;
  extensionsButton: HTMLElement | null;
  profilesButton: HTMLButtonElement | null;
  extrasButton: HTMLElement | null;
  tabGroupsContainer: HTMLElement | null;
  newTab: HTMLElement | null;
  iframeContainer: HTMLElement | null;
  activeTabIframe: HTMLElement | null;
  historyButton: HTMLElement | null;
}

class Items implements ItemsInterface {
  toggleTabsButton: HTMLElement | null;
  homeButton: HTMLElement | null;
  backButton: HTMLElement | null;
  reloadButton: HTMLElement | null;
  forwardButton: HTMLElement | null;
  addressBar: HTMLElement | null;
  bookmarkButton: HTMLElement | null;
  extensionsButton: HTMLButtonElement | null;
  profilesButton: HTMLButtonElement | null;
  extrasButton: HTMLButtonElement | null;
  tabGroupsContainer: HTMLElement | null;
  newTab: HTMLElement | null;
  iframeContainer: HTMLElement | null;
  activeTabIframe: HTMLElement | null;
  historyButton: HTMLElement | null;

  constructor() {
    this.toggleTabsButton = document.getElementById("toggleTabs");
    this.homeButton = document.getElementById("home");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.addressBar = document.getElementById("uv-address");
    this.bookmarkButton = document.getElementById("bookmark");
    this.extensionsButton = document.getElementById("extensions") as HTMLButtonElement;
    this.profilesButton = document.getElementById("profiles") as HTMLButtonElement;
    this.extrasButton = document.getElementById("more-options") as HTMLButtonElement;
    this.tabGroupsContainer = document.getElementById("tab-groups");
    this.newTab = document.getElementById("create-tab");
    this.iframeContainer = document.querySelector(".iframe-container");
    this.activeTabIframe = this.iframeContainer?.querySelector(".active") || null;
    this.historyButton = document.getElementById("history");
  }
}

export { Items };
