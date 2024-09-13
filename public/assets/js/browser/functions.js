class Functions {
  constructor() {}
  init() {
    this.addressBar = document.getElementById("uv-address");
    this.backButton = document.getElementById("backward");
    this.reloadButton = document.getElementById("reload");
    this.forwardButton = document.getElementById("forward");
    this.bookmarkButton = document.getElementById("bookmark");
    this.inspectButton = document.getElementById("inspect");
    this.extrasButton = document.getElementById("more-options");

    this.backButton.addEventListener("click", () => {
      this.backward();
    });
    this.reloadButton.addEventListener("click", () => {
      this.refresh();
    });
    this.forwardButton.addEventListener("click", () => {
      this.forward();
    });

    this.inspectButton.addEventListener("click", () => {
      this.inspectelement();
    });

    this.extrasButton.addEventListener("click", (event) => {
      this.extrasmenu(event);
    });

    document
      .getElementById("create-tab")
      .addEventListener("click", () => Tabs.createTab("daydream://newtab"));
  }
}
