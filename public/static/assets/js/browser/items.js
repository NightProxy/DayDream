class Items {
  constructor() {
    // Utilitybar
    this.toggleTabsButton = document.getElementById("toggleTabs");
    this.homeButton = document.getElementById("home");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.addressBar = document.getElementById("uv-address");
    this.bookmarkButton = document.getElementById("bookmark");
    this.extensionsButton = document.getElementById("extensions");
    this.profilesButton = document.getElementById("profiles");
    this.extrasButton = document.getElementById("more-options");
    this.tabGroupsContainer = document.getElementById("tab-groups");
    this.newTab = document.getElementById("create-tab");
    this.iframeContainer = document.querySelector(".iframe-container");
    this.activeTabIframe = this.iframeContainer.querySelector(".active");
    this.historyButton = document.getElementById("history");
  }
}
