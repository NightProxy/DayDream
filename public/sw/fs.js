class NightFS {
  constructor() {
    this.init = (async () => {
      this.tfshandle = await navigator.storage.getDirectory();
      this.core = new TFS(this.tfshandle);
    })();
  }
}