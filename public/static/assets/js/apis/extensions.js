class ExtensionsAPI {
  constructor() {
    this.db = localforage.createInstance({
      name: "extensions",
      storeName: "extensions",
    });

    this.extensions = {};
    this.extensionLists = {
      enabled: [],
      disabled: [],
      installed: [],
    };
  }

  async loadExtensions() {
    const storedExtensions = await this.db.getItem("extensions");
    const extensionLists = await this.db.getItem("extensionLists");

    this.extensions = storedExtensions || {};
    this.extensionLists = extensionLists || {
      enabled: [],
      disabled: [],
      installed: [],
    };
  }

  async saveExtensions() {
    await this.db.setItem("extensions", this.extensions);
    await this.db.setItem("extensionLists", this.extensionLists);
  }

  async registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/internal/extensions/sw.js");
      console.log("Service Worker registered for extensions.");
    } else {
      console.error("Service Worker not supported.");
    }
  }

  async installExtension(file) {
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestContent = await zip.file("manifest.json").async("string");
      const manifest = JSON.parse(manifestContent);
      const extensionID = manifest.id;

      if (this.extensions[extensionID]) {
        console.log(`Extension ${extensionID} is already installed.`);
        return;
      }

      this.extensions[extensionID] = {
        id: extensionID,
        name: manifest.name,
        enabled: false,
        manifest: manifest,
      };
      this.extensionLists.installed.push(extensionID);

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "installExtension",
          file: file,
        });
        console.log(
          `Sent ${manifest.name} to Service Worker for installation.`,
        );
      } else {
        console.error("Service Worker not available.");
      }

      await this.saveExtensions();
      console.log(`Extension ${manifest.name} installed successfully.`);
    } catch (error) {
      console.error("Failed to install extension:", error);
    }
  }

  async enable(extensionID) {
    await this.toggleExtension(extensionID, true);
  }

  async disable(extensionID) {
    await this.toggleExtension(extensionID, false);
  }

  async toggleExtension(extensionID, enabled) {
    if (this.extensions[extensionID]) {
      this.extensions[extensionID].enabled = enabled;

      if (enabled) {
        this.extensionLists.enabled.push(extensionID);
        this.extensionLists.disabled = this.extensionLists.disabled.filter(
          (id) => id !== extensionID,
        );
      } else {
        this.extensionLists.disabled.push(extensionID);
        this.extensionLists.enabled = this.extensionLists.enabled.filter(
          (id) => id !== extensionID,
        );
      }

      await this.saveExtensions();
      console.log(
        `Extension ${extensionID} ${enabled ? "enabled" : "disabled"}.`,
      );
    } else {
      console.log(`Extension ${extensionID} not found.`);
    }
  }

  async remove(extensionID) {
    if (this.extensions[extensionID]) {
      delete this.extensions[extensionID];
      this.extensionLists.installed = this.extensionLists.installed.filter(
        (id) => id !== extensionID,
      );
      this.extensionLists.enabled = this.extensionLists.enabled.filter(
        (id) => id !== extensionID,
      );
      this.extensionLists.disabled = this.extensionLists.disabled.filter(
        (id) => id !== extensionID,
      );

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "removeExtension",
          extensionID: extensionID,
        });
        console.log(`Requested removal of extension files for ${extensionID}.`);
      } else {
        console.error("Service Worker not available.");
      }

      await this.saveExtensions();
      console.log(`Extension ${extensionID} removed.`);
    } else {
      console.log(`Extension ${extensionID} not found.`);
    }
  }
}
