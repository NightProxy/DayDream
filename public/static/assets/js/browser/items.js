class Items {
  constructor() {
    this.addressBar = document.getElementById("uv-address");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.bookmarkButton = document.getElementById("bookmark");
    this.inspectButton = document.getElementById("inspect");
    this.extrasButton = document.getElementById("more-options");
    this.newTab = document.getElementById("create-tab");
    this.tabGroupsContainer = document.getElementById("tab-groups");
    this.iframeContainer = document.querySelector(".iframe-container");
    this.activeTabIframe = this.iframeContainer.querySelector(".active");
    this.homeButton = document.getElementById("home");
  }
}
