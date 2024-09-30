class Plugins {
  constructor(proxy) {
    this.plugins = {};
    this.proxy = proxy;
    this.enabledPlugins = [];
    this.disabledPlugins = [];
    this.installedPlugins = [];
    this.loadPlugins();
  }

  async loadPlugins() {
    const storedPlugins = await localforage.getItem("plugins");
    const enabledPlugins = await localforage.getItem("enabledPlugins");
    const disabledPlugins = await localforage.getItem("disabledPlugins");
    const installedPlugins = await localforage.getItem("installedPlugins");

    this.plugins = storedPlugins || {};
    this.enabledPlugins = enabledPlugins || [];
    this.disabledPlugins = disabledPlugins || [];
    this.installedPlugins = installedPlugins || [];
  }

  async savePlugins() {
    await localforage.setItem("plugins", this.plugins);
    await localforage.setItem("enabledPlugins", this.enabledPlugins);
    await localforage.setItem("disabledPlugins", this.disabledPlugins);
    await localforage.setItem("installedPlugins", this.installedPlugins);
  }

  async register(plugin) {
    this.plugins[plugin.name] = {
      ...plugin,
      enabled: false,
    };
    this.installedPlugins.push(plugin.name);
    await this.savePlugins();
    console.log(`Plugin ${plugin.name} registered.`);
  }

  async enable(pluginName) {
    if (this.plugins[pluginName]) {
      this.plugins[pluginName].enabled = true;
      this.enabledPlugins.push(pluginName);
      this.disabledPlugins = this.disabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} enabled.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }

  async disable(pluginName) {
    if (this.plugins[pluginName]) {
      this.plugins[pluginName].enabled = false;
      this.disabledPlugins.push(pluginName);
      this.enabledPlugins = this.enabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} disabled.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }

  async remove(pluginName) {
    if (this.plugins[pluginName]) {
      delete this.plugins[pluginName];
      this.installedPlugins = this.installedPlugins.filter(
        (name) => name !== pluginName,
      );
      this.enabledPlugins = this.enabledPlugins.filter(
        (name) => name !== pluginName,
      );
      this.disabledPlugins = this.disabledPlugins.filter(
        (name) => name !== pluginName,
      );
      await this.savePlugins();
      console.log(`Plugin ${pluginName} removed.`);
    } else {
      console.log(`Plugin ${pluginName} not found.`);
    }
  }
}
