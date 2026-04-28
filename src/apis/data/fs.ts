import { TFS } from "@terbiumos/tfs/browser";

class NightFS implements INightFS {
  private tfshandle!: FileSystemDirectoryHandle;
  core!: TFS;
  init: Promise<void>;

  constructor() {
    this.init = (async () => {
      this.tfshandle = await navigator.storage.getDirectory();
      this.core = new TFS(this.tfshandle);
    })();
  }

}

export { NightFS };