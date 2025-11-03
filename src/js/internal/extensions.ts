import "../../css/global.css";
import "../../css/internal.css";
import "basecoat-css/all";
import "./shared/themeInit";
import "../global/panic";
import { createIcons, icons } from "lucide";
import { SettingsAPI } from "@apis/settings";

interface ExtensionState {
  id: string;
  name: string;
  enabled: boolean;
  installed: boolean;
  icon?: string;
  description?: string;
  version?: string;
  author?: string;
}

class ExtensionsManager {
  private extensions: Map<string, ExtensionState> = new Map();
  private refluxAPI: any = null;
  private settingsAPI: SettingsAPI;

  constructor() {
    this.settingsAPI = new SettingsAPI();
    this.loadExtensionsFromBackend();
  }

  public async getUserInstalledExtensions(): Promise<string[]> {
    try {
      const installed = await this.settingsAPI.getItem("installedExtensions");
      return installed ? JSON.parse(installed as string) : [];
    } catch (error) {
      console.error("Failed to load installed extensions list:", error);
      return [];
    }
  }

  private async getEnabledExtensions(): Promise<string[]> {
    try {
      const enabled = await this.settingsAPI.getItem("enabledExtensions");
      return enabled ? JSON.parse(enabled as string) : [];
    } catch (error) {
      console.error("Failed to load enabled extensions list:", error);
      return [];
    }
  }

  private async saveEnabledExtensions(extensionIds: string[]): Promise<void> {
    try {
      await this.settingsAPI.setItem(
        "enabledExtensions",
        JSON.stringify(extensionIds),
      );
    } catch (error) {
      console.error("Failed to save enabled extensions list:", error);
    }
  }

  private async addToEnabledList(extensionId: string): Promise<void> {
    const enabled = await this.getEnabledExtensions();
    if (!enabled.includes(extensionId)) {
      enabled.push(extensionId);
      await this.saveEnabledExtensions(enabled);
    }
  }

  private async removeFromEnabledList(extensionId: string): Promise<void> {
    const enabled = await this.getEnabledExtensions();
    const filtered = enabled.filter((id) => id !== extensionId);
    await this.saveEnabledExtensions(filtered);
  }

  private async saveUserInstalledExtensions(
    extensionIds: string[],
  ): Promise<void> {
    try {
      await this.settingsAPI.setItem(
        "installedExtensions",
        JSON.stringify(extensionIds),
      );
    } catch (error) {
      console.error("Failed to save installed extensions list:", error);
    }
  }

  private async addToUserInstalledList(extensionId: string): Promise<void> {
    const installed = await this.getUserInstalledExtensions();
    if (!installed.includes(extensionId)) {
      installed.push(extensionId);
      await this.saveUserInstalledExtensions(installed);
    }
  }

  private async removeFromUserInstalledList(
    extensionId: string,
  ): Promise<void> {
    const installed = await this.getUserInstalledExtensions();
    const filtered = installed.filter((id) => id !== extensionId);
    await this.saveUserInstalledExtensions(filtered);
  }

  private async loadExtensionsFromBackend() {
    try {
      const response = await fetch("/api/store/catalog-assets/");
      if (response.ok) {
        const data = await response.json();
        const assets = data.assets || {};

        const userInstalledExtensions = await this.getUserInstalledExtensions();
        const enabledExtensions = await this.getEnabledExtensions();

        this.extensions.clear();

        Object.keys(assets).forEach((packageName) => {
          const asset = assets[packageName];
          const isUserInstalled = userInstalledExtensions.includes(packageName);

          const isEnabled =
            isUserInstalled &&
            (enabledExtensions.includes(packageName) ||
              (enabledExtensions.length === 0 && isUserInstalled));

          const extension: ExtensionState = {
            id: packageName,
            name: asset.title || packageName,
            description: asset.description,
            author: asset.author,
            version: asset.version,
            enabled: isEnabled,
            installed: isUserInstalled,
            icon: asset.image,
          };
          this.extensions.set(packageName, extension);
        });

        if (
          enabledExtensions.length === 0 &&
          userInstalledExtensions.length > 0
        ) {
          await this.saveEnabledExtensions(userInstalledExtensions);
        }

        await this.syncEnabledStateWithReflux();

        this.notifyStateChanged();
      }
    } catch (error) {
      console.error("Failed to load extensions from backend:", error);
    }
  }

  private async syncEnabledStateWithReflux() {
    try {
      if (
        !(window as any).RefluxAPIInstance &&
        !(window as any).RefluxAPIModule
      ) {
        const scriptExists =
          document.querySelector('script[src="/reflux/api.js"]') ||
          document.querySelector('script[data-src="/reflux/api.js"]');
        if (!scriptExists) {
          console.info("Reflux API not available, skipping sync");
          return;
        }
      }

      const api = await this.getRefluxAPI();
      const installedExtensions = this.getInstalledExtensions();

      for (const extension of installedExtensions) {
        if (extension.enabled) {
          if (typeof api.enablePlugin === "function") {
            await api.enablePlugin(extension.id);
          }
        } else {
          if (typeof api.disablePlugin === "function") {
            await api.disablePlugin(extension.id);
          }
        }
      }
    } catch (error) {
      console.info(
        "Could not sync enabled state with Reflux (may not be available):",
        error,
      );
    }
  }

  private notifyStateChanged() {
    const data = Array.from(this.extensions.values());
    window.dispatchEvent(
      new CustomEvent("extensionsStateChanged", {
        detail: { extensions: data },
      }),
    );
  }

  async getRefluxAPI() {
    if (this.refluxAPI) return this.refluxAPI;
    this.refluxAPI = await ensureRefluxInstance();
    return this.refluxAPI;
  }

  getExtension(id: string): ExtensionState | undefined {
    return this.extensions.get(id);
  }

  getAllExtensions(): ExtensionState[] {
    return Array.from(this.extensions.values());
  }

  getInstalledExtensions(): ExtensionState[] {
    return Array.from(this.extensions.values()).filter((ext) => ext.installed);
  }

  async addExtension(extensionData: Partial<ExtensionState>): Promise<void> {
    const id =
      extensionData.id || extensionData.name || Math.random().toString(36);
    const extension: ExtensionState = {
      id,
      name: extensionData.name || "Unknown Extension",
      enabled: extensionData.enabled ?? true,
      installed: true,
      icon: extensionData.icon,
      description: extensionData.description,
      version: extensionData.version,
      author: extensionData.author,
    };

    this.extensions.set(id, extension);

    await this.addToUserInstalledList(id);

    if (extension.enabled) {
      await this.addToEnabledList(id);
    }

    this.notifyStateChanged();

    try {
      const api = await this.getRefluxAPI();
      if (typeof api.addPlugin === "function") {
        await api.addPlugin(extensionData);
      }
    } catch (error) {
      console.error("Failed to add extension to Reflux:", error);
    }
  }

  async toggleExtension(id: string): Promise<boolean> {
    const extension = this.extensions.get(id);
    if (!extension) return false;

    extension.enabled = !extension.enabled;

    if (extension.enabled) {
      await this.addToEnabledList(id);
    } else {
      await this.removeFromEnabledList(id);
    }

    this.notifyStateChanged();

    try {
      const api = await this.getRefluxAPI();
      const pluginIdentifier = extension.id;

      if (extension.enabled) {
        if (typeof api.enablePlugin === "function") {
          await api.enablePlugin(pluginIdentifier);
        }
      } else {
        if (typeof api.disablePlugin === "function") {
          await api.disablePlugin(pluginIdentifier);
        }
      }
    } catch (error) {
      console.error("Failed to toggle extension in Reflux:", error);
    }

    return extension.enabled;
  }

  async removeExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension) return;

    extension.installed = false;
    extension.enabled = false;

    await this.removeFromUserInstalledList(id);
    await this.removeFromEnabledList(id);

    this.notifyStateChanged();

    try {
      const api = await this.getRefluxAPI();
      if (typeof api.removePlugin === "function") {
        await api.removePlugin(extension.id);
      }
    } catch (error) {
      console.error("Failed to remove extension from Reflux:", error);
    }
  }

  async refreshFromBackend(): Promise<void> {
    await this.loadExtensionsFromBackend();
  }

  addExtensionFromBackend(extensionData: ExtensionState): void {
    this.extensions.set(extensionData.id, extensionData);
    this.notifyStateChanged();
  }

  getExtensionCount(): number {
    return this.extensions.size;
  }
}

const extensionsManager = new ExtensionsManager();
(window as any).extensionsManager = extensionsManager;

(window as any).debugExtensions = async () => {
  console.log("Extensions manager:", extensionsManager);
  await extensionsManager.refreshFromBackend();
  console.log(
    "All extensions (from backend):",
    extensionsManager.getAllExtensions(),
  );
  console.log(
    "Installed extensions:",
    extensionsManager.getInstalledExtensions(),
  );
  console.log(
    "User installed list:",
    await extensionsManager.getUserInstalledExtensions(),
  );

  window.dispatchEvent(
    new CustomEvent("extensionsStateChanged", {
      detail: { extensions: extensionsManager.getAllExtensions() },
    }),
  );
};

function getExtensionLucideIcon(extensionName: string): string {
  const name = extensionName?.toLowerCase() || "";

  const iconMap: Record<string, string> = {
    adblock: "shield",
    "ad-block": "shield",
    "ad blocker": "shield",
    dark: "moon",
    night: "moon",
    theme: "palette",
    password: "key",
    vault: "key",
    auth: "key",
    translate: "languages",
    translator: "languages",
    language: "languages",
    screenshot: "camera",
    capture: "camera",
    image: "image",
    privacy: "eye-off",
    tracker: "eye-off",
    security: "shield-check",
    session: "save",
    bookmark: "bookmark",
    history: "history",
    download: "download",
    video: "video",
    audio: "volume-2",
    music: "music",
    social: "share-2",
    reddit: "message-circle",
    twitter: "twitter",
    facebook: "facebook",
    instagram: "instagram",
    youtube: "youtube",
    github: "github",
    gmail: "mail",
    calendar: "calendar",
    weather: "cloud",
    news: "newspaper",
    shopping: "shopping-cart",
    finance: "dollar-sign",
    productivity: "zap",
    developer: "code",
    code: "code",
    editor: "edit",
    search: "search",
    proxy: "globe",
    vpn: "shield",
    chat: "message-square",
    messenger: "message-square",
  };

  for (const [keyword, icon] of Object.entries(iconMap)) {
    if (name.includes(keyword)) {
      return icon;
    }
  }

  return "puzzle";
}

document.addEventListener("DOMContentLoaded", async () => {
  const aside = document.querySelector<HTMLElement>(
    '#aside[aside="extensions"]',
  );
  const toggleBtn = document.getElementById(
    "aside-toggle",
  ) as HTMLButtonElement | null;
  const closeBtn = document.getElementById(
    "aside-close",
  ) as HTMLButtonElement | null;

  const hide = (el?: HTMLElement | null) => el && el.classList.add("hidden");
  const show = (el?: HTMLElement | null) => el && el.classList.remove("hidden");

  const openAside = () => {
    if (!aside) return;
    hide(toggleBtn);
    show(closeBtn);
    aside.classList.remove("-translate-x-full");
    createIcons({ icons });
  };

  const closeAside = () => {
    if (!aside) return;
    const finalize = () => {
      hide(closeBtn);
      show(toggleBtn);
      aside.removeEventListener("transitionend", onEnd);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === aside && e.propertyName === "transform") finalize();
    };
    aside.addEventListener("transitionend", onEnd);
    aside.classList.add("-translate-x-full");
    window.setTimeout(finalize, 500);
  };

  toggleBtn?.addEventListener("click", openAside);
  closeBtn?.addEventListener("click", closeAside);

  await extensionsManager.refreshFromBackend();

  await renderInstalledExtensions();
  setupExtensionInteractions();

  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("extensionsStateChanged", {
        detail: { extensions: extensionsManager.getAllExtensions() },
      }),
    );
  }, 500);

  createIcons({ icons });
});

const grid = document.getElementById("extensionsGrid") as HTMLElement | null;
const searchInput =
  document.querySelector<HTMLInputElement>("[data-ext-search]");
const cards = (): HTMLElement[] =>
  grid ? Array.from(grid.querySelectorAll<HTMLElement>("[data-card]")) : [];

function matchesQuery(card: HTMLElement, q: string): boolean {
  if (!q) return true;
  const name = card.getAttribute("data-name") || "";
  const tags = card.getAttribute("data-tags") || "";
  const desc = card.getAttribute("data-desc") || "";
  const hay = (name + " " + tags + " " + desc).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function applySearch(): void {
  const q = (searchInput?.value || "").trim();
  cards().forEach((c) => {
    const ok = matchesQuery(c, q);
    if (c.hasAttribute("hidden")) return;
    c.style.display = ok ? "" : "none";
    c.toggleAttribute("aria-hidden", !ok);
  });
}

searchInput?.addEventListener("input", applySearch);

applySearch();

function createContextMenu(extensionId: string, x: number, y: number) {
  const existingMenu = document.querySelector(".extension-context-menu");
  if (existingMenu) {
    existingMenu.remove();
  }

  const extension = extensionsManager.getExtension(extensionId);
  if (!extension) return;

  const contextMenu = document.createElement("div");
  contextMenu.className =
    "extension-context-menu fixed z-[9999] bg-[var(--bg-2)] border border-[var(--white-10)] rounded-lg shadow-lg min-w-[140px]";
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  const menuItems = [
    {
      icon: extension.enabled ? "pause" : "play",
      label: extension.enabled ? "Disable" : "Enable",
      action: () => toggleExtensionFromContext(extensionId),
    },
    {
      icon: "settings",
      label: "Settings",
      action: () => openExtensionSettings(extensionId),
    },
    {
      icon: "trash-2",
      label: "Remove",
      action: () => removeExtensionFromContext(extensionId),
      className: "text-red-400 hover:text-red-300",
    },
  ];

  const menuList = document.createElement("ul");
  menuList.className = "py-1";

  menuItems.forEach((item) => {
    const menuItem = document.createElement("li");
    menuItem.className = `px-3 py-2 hover:bg-[var(--white-10)] cursor-pointer flex items-center gap-2 text-sm ${item.className || ""}`;

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    icon.className = "h-4 w-4";

    const label = document.createElement("span");
    label.textContent = item.label;

    menuItem.appendChild(icon);
    menuItem.appendChild(label);

    menuItem.addEventListener("click", (e) => {
      e.stopPropagation();
      item.action();
      contextMenu.remove();
    });

    menuList.appendChild(menuItem);
  });

  contextMenu.appendChild(menuList);
  document.body.appendChild(contextMenu);

  const closeMenu = (e: Event) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeMenu);
  }, 0);

  createIcons({ icons });
}

async function toggleExtensionFromContext(extensionId: string) {
  const newState = await extensionsManager.toggleExtension(extensionId);
  await refreshExtensionsUI();
  console.log(`Extension ${extensionId} ${newState ? "enabled" : "disabled"}`);
}

function openExtensionSettings(extensionId: string) {
  console.log(`Opening settings for extension ${extensionId}`);
}

async function removeExtensionFromContext(extensionId: string) {
  if (confirm("Are you sure you want to uninstall this extension?")) {
    await extensionsManager.removeExtension(extensionId);

    await renderInstalledExtensions();
    await renderMarketplace();
    console.log(`Extension ${extensionId} uninstalled`);
  }
}

async function renderInstalledExtensions() {
  const installedSection = document.querySelector(
    "#installed .grid, #installed-extensions",
  );
  if (!installedSection) return;

  const existingCards = installedSection.querySelectorAll(
    "[data-extension-id]",
  );
  existingCards.forEach((card) => card.remove());

  const installedExtensions = extensionsManager.getInstalledExtensions();
  installedExtensions.forEach((extension) => {
    const extensionCard = createInstalledExtensionCard(extension);
    installedSection.appendChild(extensionCard);
  });

  try {
    if (
      !(window as any).RefluxAPIInstance &&
      !(window as any).RefluxAPIModule
    ) {
      const scriptExists =
        document.querySelector('script[src="/reflux/api.js"]') ||
        document.querySelector('script[data-src="/reflux/api.js"]');
      if (!scriptExists) {
        console.info(
          "Reflux API not available, skipping Reflux extensions sync",
        );
        createIcons({ icons });
        return;
      }
    }

    const api = await ensureRefluxInstance();
    if (typeof api.getInstalledPlugins === "function") {
      const refluxExtensions = await api.getInstalledPlugins();

      const userInstalledExtensions =
        await extensionsManager.getUserInstalledExtensions();

      refluxExtensions.forEach((plugin: any) => {
        const pluginId = plugin.name || plugin.id || Math.random().toString(36);

        const existingExtension = extensionsManager.getExtension(pluginId);

        if (!existingExtension && userInstalledExtensions.includes(pluginId)) {
          const extension: ExtensionState = {
            id: pluginId,
            name: plugin.title || plugin.name || "Unknown Extension",
            enabled: plugin.enabled ?? true,
            installed: true,
            icon: plugin.icon,
            description: plugin.description,
            version: plugin.version,
            author: plugin.author,
          };

          extensionsManager.addExtensionFromBackend(extension);
          const extensionCard = createInstalledExtensionCard(extension);
          installedSection.appendChild(extensionCard);
        }
      });
    }
  } catch (error) {
    console.info(
      "Could not load extensions from Reflux backend (may not be available):",
      error,
    );
  }

  createIcons({ icons });
}

function createInstalledExtensionCard(extension: ExtensionState): HTMLElement {
  const card = document.createElement("div");
  card.className =
    "bg-[var(--bg-1)] rounded-xl p-6 ring-1 ring-inset ring-[var(--white-08)] flex flex-col";
  card.setAttribute("data-extension-id", extension.id);

  const header = document.createElement("div");
  header.className = "flex items-center gap-3 mb-4";

  const iconContainer = document.createElement("div");
  iconContainer.className =
    "h-8 w-8 rounded-md bg-[var(--white-10)] flex items-center justify-center";

  if (
    extension.icon &&
    (extension.icon.startsWith("http") || extension.icon.startsWith("/"))
  ) {
    const icon = document.createElement("img");
    icon.src = extension.icon;
    icon.className = "h-8 w-8 rounded-md";
    icon.alt = extension.name;
    icon.onerror = () => {
      iconContainer.innerHTML = "";
      const fallbackIcon = document.createElement("i");
      fallbackIcon.setAttribute(
        "data-lucide",
        getExtensionLucideIcon(extension.name),
      );
      fallbackIcon.className = "h-5 w-5 text-[var(--text)]";
      iconContainer.appendChild(fallbackIcon);
      createIcons({ icons });
    };
    iconContainer.appendChild(icon);
  } else {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", getExtensionLucideIcon(extension.name));
    icon.className = "h-5 w-5 text-[var(--text)]";
    iconContainer.appendChild(icon);
  }

  const info = document.createElement("div");
  info.className = "flex-1";

  const title = document.createElement("h3");
  title.className = "text-sm font-medium text-[var(--text)]";
  title.textContent = extension.name;

  const description = document.createElement("p");
  description.className = "text-xs text-[var(--proto)]";
  description.textContent = extension.description || "No description available";

  info.appendChild(title);
  info.appendChild(description);

  const statusIndicator = document.createElement("div");
  statusIndicator.className = `w-2 h-2 rounded-full ${extension.enabled ? "bg-green-500" : "bg-gray-400"}`;
  statusIndicator.title = extension.enabled ? "Enabled" : "Disabled";

  header.appendChild(iconContainer);
  header.appendChild(info);
  header.appendChild(statusIndicator);

  const actions = document.createElement("div");
  actions.className = "mt-auto flex justify-between items-center gap-2";

  const toggleContainer = document.createElement("div");
  toggleContainer.className = "flex items-center gap-2";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "extension-toggle";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = extension.enabled;
  toggleInput.setAttribute("data-extension-toggle", extension.id);

  const toggleSlider = document.createElement("div");
  toggleSlider.className = "extension-toggle-slider";

  const toggleText = document.createElement("span");
  toggleText.className = "text-xs text-[var(--proto)]";
  toggleText.textContent = extension.enabled ? "Enabled" : "Disabled";

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);
  toggleContainer.appendChild(toggleLabel);
  toggleContainer.appendChild(toggleText);

  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "flex gap-2";

  const removeBtn = document.createElement("button");
  removeBtn.className =
    "px-3 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600";
  removeBtn.textContent = "Remove";
  removeBtn.setAttribute("data-remove-extension", extension.id);

  buttonsContainer.appendChild(removeBtn);

  actions.appendChild(toggleContainer);
  actions.appendChild(buttonsContainer);

  card.appendChild(header);
  card.appendChild(actions);

  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    createContextMenu(extension.id, e.clientX, e.clientY);
  });

  return card;
}

function setupExtensionInteractions() {
  const existingCards = document.querySelectorAll("[data-card]");
  existingCards.forEach((card) => {
    const extensionName = card.getAttribute("data-name");
    if (extensionName) {
      card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const mouseEvent = e as MouseEvent;

        const extensionId = extensionName.toLowerCase().replace(/\s+/g, "-");
        const installedExtension = extensionsManager.getExtension(extensionId);

        if (installedExtension) {
          createContextMenu(
            extensionId,
            mouseEvent.clientX,
            mouseEvent.clientY,
          );
        } else {
          createMarketplaceContextMenu(
            extensionName,
            mouseEvent.clientX,
            mouseEvent.clientY,
          );
        }
      });
    }
  });

  const filterButtons = document.querySelectorAll("[data-ext-filter]");
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const filter = (e.target as HTMLElement).getAttribute("data-ext-filter");
      applyExtensionFilter(filter);

      filterButtons.forEach((b) =>
        b.classList.remove("bg-[var(--main)]", "text-[var(--bg-2)]"),
      );
      filterButtons.forEach((b) => b.classList.add("bg-[var(--white-05)]"));

      btn.classList.remove("bg-[var(--white-05)]");
      btn.classList.add("bg-[var(--main)]", "text-[var(--bg-2)]");
    });
  });

  const actionButtons = document.querySelectorAll("[data-action]");
  actionButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.getAttribute("data-action");
      const card = btn.closest("[data-card]");
      const extensionName = card?.getAttribute("data-name");

      if (!extensionName) return;

      switch (action) {
        case "star":
          toggleStarredState(btn, card);
          break;
        case "hide":
          hideExtension(card);
          break;
        case "expand":
          toggleExpandedState(card);
          break;
      }
    });
  });

  document.addEventListener("change", async (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.hasAttribute("data-extension-toggle")) {
      const extensionId = target.getAttribute("data-extension-toggle");
      if (extensionId) {
        const enabled = target.checked;
        await extensionsManager.toggleExtension(extensionId);

        const card = target.closest("[data-extension-id]");
        if (card) {
          const statusIndicator = card.querySelector(".w-2.h-2.rounded-full");
          if (statusIndicator) {
            statusIndicator.className = `w-2 h-2 rounded-full ${enabled ? "bg-green-500" : "bg-gray-400"}`;
            statusIndicator.setAttribute(
              "title",
              enabled ? "Enabled" : "Disabled",
            );
          }

          const toggleText = target.parentElement
            ?.nextElementSibling as HTMLElement;
          if (toggleText) {
            toggleText.textContent = enabled ? "Enabled" : "Disabled";
          }
        }

        const marketplaceCard = target.closest("[data-card]");
        if (marketplaceCard) {
          const statusElement = marketplaceCard.querySelector(
            "[data-extra] .text-sm",
          );
          if (statusElement && statusElement.textContent !== "All") {
            statusElement.textContent = enabled ? "Active" : "Inactive";
          }

          const toggleText = target.parentElement
            ?.nextElementSibling as HTMLElement;
          if (toggleText) {
            toggleText.textContent = enabled ? "Enabled" : "Disabled";
          }
        }
      }
    }
  });

  const removeButtons = document.querySelectorAll("[data-remove-extension]");
  removeButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const extensionId = btn.getAttribute("data-remove-extension");
      if (extensionId) {
        const card =
          btn.closest("[data-extension-id]") || btn.closest("[data-card]");
        const extensionName =
          card?.querySelector("h3")?.textContent ||
          card?.getAttribute("data-name") ||
          "this extension";

        if (confirm(`Are you sure you want to uninstall ${extensionName}?`)) {
          await extensionsManager.removeExtension(extensionId);

          await renderInstalledExtensions();
          await renderMarketplace();
        }
      }
    });
  });
}

function toggleStarredState(button: Element, card: Element | null) {
  const isPressed = button.getAttribute("aria-pressed") === "true";
  button.setAttribute("aria-pressed", (!isPressed).toString());

  const badge = card?.querySelector('[data-badge="star"]');
  if (badge) {
    badge.classList.toggle("hidden", isPressed);
  }

  const icon = button.querySelector("i");
  if (icon) {
    icon.setAttribute("data-lucide", isPressed ? "star" : "star");
    icon.classList.toggle("fill-current", !isPressed);
  }

  createIcons({ icons });
}

function hideExtension(card: Element | null) {
  if (card) {
    card.setAttribute("hidden", "true");
    (card as HTMLElement).style.display = "none";
  }
}

function toggleExpandedState(card: Element | null) {
  if (card) {
    const isExpanded = card.getAttribute("data-expanded") === "true";
    card.setAttribute("data-expanded", (!isExpanded).toString());

    const extraContent = card.querySelector("[data-extra]");
    if (extraContent) {
      if (!isExpanded) {
        extraContent.setAttribute("data-expanded", "true");
      } else {
        extraContent.removeAttribute("data-expanded");
      }
    }
  }
}

function createMarketplaceContextMenu(
  extensionName: string,
  x: number,
  y: number,
) {
  const existingMenu = document.querySelector(".extension-context-menu");
  if (existingMenu) {
    existingMenu.remove();
  }

  const contextMenu = document.createElement("div");
  contextMenu.className =
    "extension-context-menu fixed z-[9999] bg-[var(--bg-2)] border border-[var(--white-10)] rounded-lg shadow-lg min-w-[140px]";
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  const menuItems = [
    {
      icon: "download",
      label: "Install",
      action: () => console.log(`Installing ${extensionName}`),
    },
    {
      icon: "star",
      label: "Add to Favorites",
      action: () => console.log(`Added ${extensionName} to favorites`),
    },
    {
      icon: "info",
      label: "More Info",
      action: () => console.log(`Show info for ${extensionName}`),
    },
  ];

  const menuList = document.createElement("ul");
  menuList.className = "py-1";

  menuItems.forEach((item) => {
    const menuItem = document.createElement("li");
    menuItem.className =
      "px-3 py-2 hover:bg-[var(--white-10)] cursor-pointer flex items-center gap-2 text-sm";

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    icon.className = "h-4 w-4";

    const label = document.createElement("span");
    label.textContent = item.label;

    menuItem.appendChild(icon);
    menuItem.appendChild(label);

    menuItem.addEventListener("click", (e) => {
      e.stopPropagation();
      item.action();
      contextMenu.remove();
    });

    menuList.appendChild(menuItem);
  });

  contextMenu.appendChild(menuList);
  document.body.appendChild(contextMenu);

  const closeMenu = (e: Event) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeMenu);
  }, 0);

  createIcons({ icons });
}

function applyExtensionFilter(filter: string | null) {
  const cards = document.querySelectorAll("[data-card]");
  cards.forEach((card) => {
    const isStarred = card.querySelector('[data-badge="star"]:not(.hidden)');

    let shouldShow = true;

    switch (filter) {
      case "starred":
        shouldShow = !!isStarred;
        break;
      case "all":
      default:
        shouldShow = true;
        break;
    }

    (card as HTMLElement).style.display = shouldShow ? "" : "none";
  });
}

async function refreshExtensionsUI() {
  await extensionsManager.refreshFromBackend();

  const installedSection = document.querySelector(
    "#installed .grid, #installed-extensions",
  );
  if (installedSection) {
    const extensionCards = installedSection.querySelectorAll(
      "[data-extension-id]",
    );
    extensionCards.forEach((card) => card.remove());

    await renderInstalledExtensions();
  }
}

async function loadScript(src: string, asModule = false): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.setAttribute("data-src", src);
    if (asModule) s.type = "module";
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

async function ensureRefluxInstance(): Promise<any> {
  if ((window as any).RefluxAPIInstance)
    return (window as any).RefluxAPIInstance;

  let ctor: any =
    (window as any).RefluxAPIModule?.RefluxAPI ||
    (window as any).RefluxAPIModule;

  if (!ctor) {
    try {
      await loadScript("/reflux/api.js");
      ctor =
        (window as any).RefluxAPIModule?.RefluxAPI ||
        (window as any).RefluxAPIModule;
    } catch (err) {
      console.error("Failed to load Reflux API script:", err);
      throw err;
    }
  }

  if (!ctor || typeof ctor !== "function") {
    console.error(
      "Reflux API constructor not found on window:",
      (window as any).RefluxAPIModule,
    );
    throw new Error("Reflux API unavailable");
  }

  try {
    const api = new ctor();
    (window as any).RefluxAPIInstance = api;
    console.log("RefluxAPI instance created", api);
    return api;
  } catch (err) {
    console.error("Failed to instantiate Reflux API:", err);
    throw err;
  }
}

async function fetchCatalogAssets(): Promise<Array<any>> {
  try {
    const res = await fetch("/api/store/catalog-assets/");
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    const assetsObj = json.assets || {};
    return Object.keys(assetsObj).map((k) => ({
      package_name: k,
      ...assetsObj[k],
    }));
  } catch (err) {
    console.error("Failed to fetch catalog assets:", err);
    return [];
  }
}

function normalizeSites(sites: any): string[] {
  if (!sites) return ["*"];
  if (Array.isArray(sites)) return sites;

  try {
    if (typeof sites === "string") {
      const parsed = JSON.parse(sites);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return ["*"];
}

async function renderMarketplace(containerId = "extensionsGrid") {
  const root = document.getElementById(containerId);
  if (!root) return;

  let wrapper = document.querySelector(
    "[data-marketplace-wrapper]",
  ) as HTMLElement;
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "mb-6";
    wrapper.setAttribute("data-marketplace-wrapper", "true");
    wrapper.innerHTML = `<div class="border-b border-[var(--white-08)] pb-4 mb-4"><h2 class="text-xl font-semibold text-[var(--text)] mb-2">Marketplace</h2><p class="text-sm text-[var(--proto)]">Import plugins from the remote catalog into your Reflux runtime.</p></div>`;

    const list = document.createElement("div");
    list.className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
    list.setAttribute("data-marketplace-list", "true");
    wrapper.appendChild(list);
    root.parentElement?.insertBefore(wrapper, root);
  }

  const list = wrapper.querySelector("[data-marketplace-list]") as HTMLElement;
  if (!list) return;

  list.innerHTML = "";

  const assets = await fetchCatalogAssets();

  if (assets.length === 0) {
    const note = document.createElement("div");
    note.className =
      "text-sm text-[var(--proto)] col-span-full text-center py-8";
    note.textContent = "No marketplace assets available.";
    list.appendChild(note);
    return;
  }

  assets.forEach((asset) => {
    const card = document.createElement("div");
    card.className =
      "group relative bg-[var(--bg-1)] rounded-2xl p-5 ring-1 ring-inset ring-[var(--white-08)] hover:ring-[var(--main-35a)] transition";
    card.setAttribute("data-card", "");
    card.setAttribute("data-name", asset.title || asset.package_name);
    card.setAttribute("data-tags", (asset.tags || []).join(" "));
    card.setAttribute("data-desc", asset.description || "");

    const extension = extensionsManager.getExtension(asset.package_name);
    const isInstalled = extension && extension.installed;

    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="h-9 w-9 rounded-md bg-[var(--white-10)] flex items-center justify-center">
          ${
            asset.icon &&
            (asset.icon.startsWith("http") || asset.icon.startsWith("/"))
              ? `<img src="${asset.icon}" alt="${asset.title || asset.package_name}" class="h-9 w-9 rounded-md" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <i data-lucide="${getExtensionLucideIcon(asset.title || asset.package_name)}" class="h-6 w-6 text-[var(--text)]" style="display:none;"></i>`
              : `<i data-lucide="${getExtensionLucideIcon(asset.title || asset.package_name)}" class="h-6 w-6 text-[var(--text)]"></i>`
          }
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-[var(--text)] truncate">${asset.title || asset.package_name}</h3>
            <div class="flex items-center gap-1">
              <button
                data-action="star"
                aria-pressed="false"
                class="grid place-items-center h-8 w-8 rounded-lg hover:bg-[var(--white-05)]"
              >
                <i data-lucide="star" class="h-4 w-4"></i>
              </button>
              <button
                data-action="hide"
                class="grid place-items-center h-8 w-8 rounded-lg hover:bg-[var(--white-05)]"
              >
                <i data-lucide="eye-off" class="h-4 w-4"></i>
              </button>
            </div>
          </div>
          <p class="text-xs text-[var(--proto)] mb-2">${asset.description || "No description available"}</p>
          <div class="flex items-center gap-1 text-xs text-[var(--proto)]">
            <span>by ${asset.author || "Unknown"}</span>
            ${asset.version ? `<span>• v${asset.version}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2 opacity-0 translate-y-1 transition duration-200 group-hover:opacity-100 group-hover:translate-y-0" data-extra>
        <div class="rounded-xl bg-[var(--bg-2)] ring-1 ring-inset ring-[var(--white-08)] p-3">
          <p class="text-[10px] uppercase tracking-wide text-[var(--proto)] mb-1">Sites</p>
          <p class="text-sm">${normalizeSites(asset.sites).length === 1 && normalizeSites(asset.sites)[0] === "*" ? "All" : normalizeSites(asset.sites).length}</p>
        </div>
        <div class="rounded-xl bg-[var(--bg-2)] ring-1 ring-inset ring-[var(--white-08)] p-3">
          <p class="text-[10px] uppercase tracking-wide text-[var(--proto)] mb-1">Status</p>
          <p class="text-sm">${isInstalled ? (extension!.enabled ? "Active" : "Inactive") : "Available"}</p>
        </div>
        <div class="col-span-2 rounded-xl bg-[var(--bg-2)] ring-1 ring-inset ring-[var(--white-08)] p-3">
          <p class="text-xs text-[var(--text)]" data-desc>${asset.description || "No description available"}</p>
        </div>
        <div class="col-span-2 flex items-center justify-between">
          ${
            isInstalled
              ? `<div class="flex items-center gap-2">
                 <label class="extension-toggle">
                   <input type="checkbox" ${extension!.enabled ? "checked" : ""} data-extension-toggle="${asset.package_name}">
                   <div class="extension-toggle-slider"></div>
                 </label>
                 <span class="text-xs text-[var(--proto)]">${extension!.enabled ? "Enabled" : "Disabled"}</span>
               </div>
               <button class="px-3 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600" data-remove-extension="${asset.package_name}">Remove</button>`
              : `<button class="px-3 py-2 rounded-lg bg-[var(--main)] text-[var(--bg-2)] text-sm hover:bg-[var(--main)]/90" data-install-extension="${asset.package_name}">Install</button>
               <button data-action="expand" class="px-3 py-2 rounded-lg bg-[var(--white-05)] text-sm hover:bg-[var(--white-10)]">Details</button>`
          }
        </div>
      </div>
      <span data-badge="star" class="hidden absolute -top-2 -right-2 h-6 px-2 rounded-full text-xs grid place-items-center bg-[var(--main)] text-[var(--bg-2)]">Starred</span>
    `;

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (isInstalled) {
        createContextMenu(asset.package_name, e.clientX, e.clientY);
      } else {
        createMarketplaceContextMenu(
          asset.title || asset.package_name,
          e.clientX,
          e.clientY,
        );
      }
    });

    const installBtn = card.querySelector("[data-install-extension]");
    if (installBtn) {
      installBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = e.target as HTMLButtonElement;
        const originalText = btn.textContent;

        try {
          btn.disabled = true;
          btn.textContent = "Installing...";

          await installExtensionFromMarketplace(asset);

          await extensionsManager.refreshFromBackend();
          await renderMarketplace(containerId);
          await renderInstalledExtensions();
        } catch (error) {
          console.error("Failed to install extension:", error);
          btn.textContent = "Failed";
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
          }, 2000);
        }
      });
    }

    list.appendChild(card);
  });

  applySearch();
  setupMarketplaceInteractions(list);
}

async function installExtensionFromMarketplace(asset: any): Promise<void> {
  const api = await ensureRefluxInstance();

  const plugin = {
    function: asset.function || "",
    name: asset.package_name,
    title: asset.title,
    description: asset.description,
    author: asset.author,
    version: asset.version,
    sites: normalizeSites(asset.sites),
  };

  await extensionsManager.addExtension({
    id: asset.package_name,
    name: asset.title || asset.package_name,
    description: asset.description,
    author: asset.author,
    version: asset.version,
    enabled: true,
    installed: true,
    icon: asset.icon,
  });

  if (typeof api.addPlugin === "function") {
    await api.addPlugin(plugin);
  } else if (typeof api.createPlugin === "function") {
    await api.createPlugin(plugin);
  } else {
    throw new Error("Reflux API missing addPlugin method");
  }

  if (typeof api.enablePlugin === "function") {
    await api.enablePlugin(plugin.name);
  }
}

function setupMarketplaceInteractions(container: HTMLElement): void {
  const actionButtons = container.querySelectorAll("[data-action]");
  actionButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.getAttribute("data-action");
      const card = btn.closest("[data-card]");

      switch (action) {
        case "star":
          toggleStarredState(btn, card);
          break;
        case "hide":
          hideExtension(card);
          break;
        case "expand":
          toggleExpandedState(card);
          break;
      }
    });
  });

  const toggleSwitches = container.querySelectorAll("[data-extension-toggle]");
  toggleSwitches.forEach((toggle) => {
    toggle.addEventListener("change", async (e) => {
      const extensionId = toggle.getAttribute("data-extension-toggle");
      if (extensionId) {
        const enabled = (e.target as HTMLInputElement).checked;
        await extensionsManager.toggleExtension(extensionId);

        const toggleText = toggle.parentElement
          ?.nextElementSibling as HTMLElement;
        if (toggleText) {
          toggleText.textContent = enabled ? "Enabled" : "Disabled";
        }

        const card = toggle.closest("[data-card]");
        const statusElement = card?.querySelector("[data-extra] .text-sm");
        if (statusElement) {
          statusElement.textContent = enabled ? "Active" : "Inactive";
        }
      }
    });
  });

  const removeButtons = container.querySelectorAll("[data-remove-extension]");
  removeButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const extensionId = btn.getAttribute("data-remove-extension");
      if (extensionId) {
        const card = btn.closest("[data-card]");
        const extensionName =
          card?.getAttribute("data-name") || "this extension";

        if (confirm(`Are you sure you want to uninstall ${extensionName}?`)) {
          await extensionsManager.removeExtension(extensionId);

          const containerId =
            container.closest("[id]")?.getAttribute("id") || "extensionsGrid";
          await renderMarketplace(containerId);
          await renderInstalledExtensions();
        }
      }
    });
  });
}

renderMarketplace().catch((e) =>
  console.error("Marketplace render failed:", e),
);
