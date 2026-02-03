import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "../../css/internal.css";
import "./shared/themeInit";
import "basecoat-css/all";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import iro from "@jaames/iro";
import { themeManager } from "@js/utils/themeManager";
import "../global/panic";
import {
  KeybindManager,
  KEYBIND_CATEGORIES,
} from "@browser/functions/keybinds";
const settingsAPI = new SettingsAPI();
const eventsAPI = new EventSystem();
import { createIcons, icons } from "lucide";
import {
  checkNightPlusStatus,
  getPremiumWispServers,
  isAuthenticated,
} from "@apis/nightplus";

document.addEventListener("DOMContentLoaded", () => {
  const aside = document.querySelector<HTMLElement>('#aside[aside="settings"]');
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

  createIcons({ icons });
});

const initializeSelect = async (
  selectId: string,
  settingsKey: string,
  defaultValue: string,
  onChangeCallback: Function | null = null,
) => {
  const selectElement = document.getElementById(selectId) as HTMLSelectElement;

  if (!selectElement) {
    console.error(`Select element with id "${selectId}" not found.`);
    return;
  }

  const savedValue = (await settingsAPI.getItem(settingsKey)) || defaultValue;
  selectElement.value = savedValue;

  selectElement.addEventListener("change", async () => {
    await settingsAPI.setItem(settingsKey, selectElement.value);
    if (onChangeCallback) {
      await onChangeCallback();
    }
    location.reload();
  });
};

const initSwitch = async (
  switchId: string,
  settingsKey: string,
  onChangeCallback: Function | null = null,
  defaultValue: boolean = false,
) => {
  const switchElement = document.getElementById(switchId) as HTMLInputElement;

  if (!switchElement) {
    console.error(`Switch element with id "${switchId}" not found.`);
    return;
  }

  const savedValue = await settingsAPI.getItem(settingsKey);
  if (savedValue === null || savedValue === undefined) {
    switchElement.checked = defaultValue;
    await settingsAPI.setItem(settingsKey, defaultValue.toString());
  } else {
    switchElement.checked = savedValue === "true";
  }

  switchElement.addEventListener("change", async () => {
    await settingsAPI.setItem(settingsKey, switchElement.checked.toString());
    if (onChangeCallback) {
      await onChangeCallback();
    }
  });
};

const initButton = (buttonId: string, action: () => void) => {
  const buttonElement = document.getElementById(buttonId) as HTMLButtonElement;

  if (!buttonElement) {
    console.error(`Button element with id "${buttonId}" not found.`);
    return;
  }

  buttonElement.addEventListener("click", action);
};

async function isNightPlusActive(): Promise<boolean> {
  try {
    return await checkNightPlusStatus();
  } catch (error) {
    console.error("Error checking Night+ status:", error);
    return false;
  }
}

async function initializeWispSelect() {
  const wispSelect = document.getElementById("wispSelect") as HTMLSelectElement;
  const useCustomBtn = document.getElementById(
    "useCustomWisp",
  ) as HTMLButtonElement;
  const customInput = document.getElementById("wispCustomInput") as HTMLElement;
  const customSetting = document.getElementById(
    "wispCustomSetting",
  ) as HTMLInputElement;
  const saveCustomBtn = document.getElementById(
    "saveWispSetting",
  ) as HTMLButtonElement;
  const cancelCustomBtn = document.getElementById(
    "cancelWispCustom",
  ) as HTMLButtonElement;
  const nightPlusNotice = document.getElementById(
    "nightPlusWispNotice",
  ) as HTMLElement;
  const proxyRoutingToggle = document.getElementById(
    "proxyRoutingToggle",
  ) as HTMLInputElement;
  const proxyRoutingNotice = document.getElementById(
    "proxyRoutingNotice",
  ) as HTMLElement;

  if (!wispSelect) {
    console.error("WISP select element not found");
    return;
  }

  const defaultWispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";

  const authenticated = await isAuthenticated();
  const hasNightPlus = authenticated ? await isNightPlusActive() : false;

  wispSelect.innerHTML = '<option value="auto">Automatic (Default)</option>';

  const freeServers = [{ name: "Default Server", url: defaultWispUrl }];

  freeServers.forEach((server) => {
    const option = document.createElement("option");
    option.value = server.url;
    option.textContent = server.name;
    wispSelect.appendChild(option);
  });

  if (authenticated) {
    const vpnOptgroup = document.createElement("optgroup");
    vpnOptgroup.label = "🔒 VPN Servers (Night+)";

    const vpnServers = [
      { name: "Germany (Mullvad)", path: "germany" },
      { name: "Japan (Mullvad)", path: "japan" },
      { name: "Mexico (Mullvad)", path: "mexico" },
      { name: "Switzerland (Mullvad)", path: "switzerland" },
      { name: "United Kingdom (Mullvad)", path: "uk" },
      { name: "US East", path: "useast" },
      { name: "Canada East", path: "caeast" },
      { name: "US West", path: "uswest" },
    ];

    vpnServers.forEach((server) => {
      const option = document.createElement("option");
      option.value = `wss://demoplussrv.night-x.com/api/servers/${server.path}/`;
      option.textContent = server.name;
      vpnOptgroup.appendChild(option);
    });

    wispSelect.appendChild(vpnOptgroup);
  }

  if (hasNightPlus) {
    try {
      const premiumServers = await getPremiumWispServers();

      if (premiumServers.length > 0) {
        /*const optgroup = document.createElement("optgroup");
        optgroup.label = "⭐ Premium Servers (Night+)";

        premiumServers.forEach((server) => {
          const option = document.createElement("option");
          option.value = server.url;
          option.textContent = `${server.name} (${server.region})`;
          optgroup.appendChild(option);
        });

        wispSelect.appendChild(optgroup);*/
      }

      if (nightPlusNotice) {
        nightPlusNotice.classList.add("hidden");
      }

      if (proxyRoutingNotice) {
        proxyRoutingNotice.classList.add("hidden");
      }

      if (proxyRoutingToggle) {
        proxyRoutingToggle.disabled = false;
      }
    } catch (error) {
      console.error("Failed to fetch premium WISP servers:", error);
    }
    if (proxyRoutingNotice) {
      proxyRoutingNotice.classList.remove("hidden");
    }
  } else {
    if (nightPlusNotice) {
      nightPlusNotice.classList.remove("hidden");
    }
  }

  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom WISP Server";
  wispSelect.appendChild(customOption);

  const savedWisp = (await settingsAPI.getItem("wisp")) || "auto";
  const savedCustomWisp = await settingsAPI.getItem("wisp-custom");

  if (savedCustomWisp) {
    wispSelect.value = "custom";
    if (customSetting) {
      customSetting.value = savedCustomWisp;
    }
  } else {
    wispSelect.value = savedWisp;
  }

  wispSelect.addEventListener("change", async () => {
    if (wispSelect.value === "custom") {
      if (customInput) {
        customInput.classList.remove("hidden");
      }
      if (useCustomBtn) {
        useCustomBtn.classList.add("hidden");
      }
    } else {
      if (customInput) {
        customInput.classList.add("hidden");
      }
      if (useCustomBtn) {
        useCustomBtn.classList.remove("hidden");
      }

      if (wispSelect.value === "auto") {
        await settingsAPI.removeItem("wisp");
        await settingsAPI.removeItem("wisp-custom");
      } else {
        await settingsAPI.setItem("wisp", wispSelect.value);
        await settingsAPI.removeItem("wisp-custom");
      }
      location.reload();
    }
  });

  if (useCustomBtn) {
    useCustomBtn.addEventListener("click", () => {
      wispSelect.value = "custom";
      if (customInput) {
        customInput.classList.remove("hidden");
      }
      useCustomBtn.classList.add("hidden");
    });
  }

  if (saveCustomBtn) {
    saveCustomBtn.addEventListener("click", async () => {
      if (customSetting && customSetting.value.trim()) {
        await settingsAPI.setItem("wisp-custom", customSetting.value.trim());
        await settingsAPI.removeItem("wisp");
        console.log("Custom WISP server saved:", customSetting.value.trim());
        location.reload();
      }
    });
  }

  if (cancelCustomBtn) {
    cancelCustomBtn.addEventListener("click", () => {
      wispSelect.value = savedWisp === "custom" ? "auto" : savedWisp;
      if (customInput) {
        customInput.classList.add("hidden");
      }
      if (useCustomBtn) {
        useCustomBtn.classList.remove("hidden");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".settingItem").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      document.querySelectorAll(".settingItem").forEach((item) => {
        item.classList.remove("bg-[var(--white-05)]");
      });

      link.classList.add("bg-[var(--white-05)]");

      const href = link.getAttribute("href");
      if (href) {
        const targetId = href.replace(/^#\/?/, "");
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
          });
        }
      }
    });
  });

  const observerOptions = {
    root: null,
    rootMargin: "-20% 0px -70% 0px",
    threshold: 0,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        document.querySelectorAll(".settingItem").forEach((item) => {
          item.classList.remove("bg-[var(--white-05)]");
        });

        const activeLink = document.querySelector(
          `.settingItem[href="#${entry.target.id}"]`,
        );
        if (activeLink) {
          activeLink.classList.add("bg-[var(--white-05)]");
        }
      }
    });
  }, observerOptions);

  document.querySelectorAll("section[id]").forEach((section) => {
    observer.observe(section);
  });

  const firstLink = document.querySelector(".settingItem");
  if (firstLink) {
    firstLink.classList.add("bg-[var(--white-05)]");
  }

  await initializeSelect("URL-cloakSelect", "URL_Cloak", "off");

  await initSwitch("autoCloakSwitch", "autoCloak", () => {
    eventsAPI.emit("cloaking:auto-toggle", null);
  });

  await initSwitch(
    "disableTabCloseSwitch",
    "disableTabClose",
    async () => {
      const isEnabled = await settingsAPI.getItem("disableTabClose");
      if (isEnabled === "true") {
        window.addEventListener("beforeunload", (e) => {
          e.preventDefault();
          e.returnValue = "";
        });
      }
    },
    true,
  );

  await initializeTabCloakSystem();

  await initializeSelect("UIStyleSelect", "UIStyle", "operagx", () => {
    eventsAPI.emit("UI:changeStyle", null);
    eventsAPI.emit("theme:template-change", null);
    setTimeout(() => {
      eventsAPI.emit("UI:changeStyle", null);
      eventsAPI.emit("theme:template-change", null);
    }, 100);
  });

  const colorPicker = new (iro as any).ColorPicker(".colorPicker", {
    width: 280,
    color: (await settingsAPI.getItem("themeColor")) || "rgba(141, 1, 255, 1)",
    borderWidth: 1,
    borderColor: "#fff",
  });

  const hexInput = document.getElementById("hexInput") as HTMLInputElement;
  const rgbInput = document.getElementById("rgbString") as HTMLInputElement;
  const hslInput = document.getElementById("hslString") as HTMLInputElement;

  colorPicker.on(["color:init", "color:change"], (color: any) => {
    hexInput.value = color.hexString;
    rgbInput.value = color.rgbString;
    hslInput.value = color.hslString;
  });

  hexInput.addEventListener("change", (_e: Event) => {
    colorPicker.color.hexString = hexInput.value;
    rgbInput.value = colorPicker.color.rgbString;
    hslInput.value = colorPicker.color.hslString;

    eventsAPI.emit("theme:color-change", {
      color: colorPicker.color.rgbaString,
    });
  });

  rgbInput.addEventListener("change", (_e: Event) => {
    colorPicker.color.rgbString = rgbInput.value;
    hexInput.value = colorPicker.color.hexString;
    hslInput.value = colorPicker.color.hslString;

    eventsAPI.emit("theme:color-change", {
      color: colorPicker.color.rgbaString,
    });
  });

  hslInput.addEventListener("change", (_e: Event) => {
    colorPicker.color.hslString = hslInput.value;
    hexInput.value = colorPicker.color.hexString;
    rgbInput.value = colorPicker.color.rgbString;

    eventsAPI.emit("theme:color-change", {
      color: colorPicker.color.rgbaString,
    });
  });

  colorPicker.on("input:end", (color: any) => {
    eventsAPI.emit("theme:color-change", { color: color.rgbaString });
    console.log("Custom color changed to:", color.rgbaString);
  });

  await initializeThemeSystem();

  async function initializeTabCloakSystem() {
    try {
      console.log("Initializing tab cloak system...");

      const response = await fetch("/json/c.json");
      const data = await response.json();
      const presets = data.presets;

      const tabCloakSelect = document.getElementById(
        "tabCloakSelect",
      ) as HTMLSelectElement;
      const customTabCloakOptions = document.getElementById(
        "customTabCloakOptions",
      ) as HTMLElement;
      const customTabTitle = document.getElementById(
        "customTabTitle",
      ) as HTMLInputElement;
      const customTabFavicon = document.getElementById(
        "customTabFavicon",
      ) as HTMLInputElement;
      const uploadFaviconBtn = document.getElementById(
        "uploadFaviconBtn",
      ) as HTMLButtonElement;
      const faviconUpload = document.getElementById(
        "faviconUpload",
      ) as HTMLInputElement;
      const faviconPreviewImg = document.getElementById(
        "faviconPreviewImg",
      ) as HTMLImageElement;
      const titlePreview = document.getElementById(
        "titlePreview",
      ) as HTMLElement;

      if (!tabCloakSelect) {
        console.error("Tab cloak select element not found");
        return;
      }

      tabCloakSelect.innerHTML = "";
      presets.forEach((preset: any) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name;
        tabCloakSelect.appendChild(option);
      });

      const currentTabCloak = (await settingsAPI.getItem("tabCloak")) || "off";
      tabCloakSelect.value = currentTabCloak;

      const savedCustomTitle =
        (await settingsAPI.getItem("customTabTitle")) || "";
      const savedCustomFavicon =
        (await settingsAPI.getItem("customTabFavicon")) || "";
      if (customTabTitle) customTabTitle.value = savedCustomTitle;
      if (customTabFavicon) customTabFavicon.value = savedCustomFavicon;

      const toggleCustomOptions = () => {
        if (tabCloakSelect.value === "custom") {
          customTabCloakOptions?.classList.remove("hidden");
        } else {
          customTabCloakOptions?.classList.add("hidden");
        }
      };
      toggleCustomOptions();

      const applyTabCloak = async () => {
        const selectedPreset = presets.find(
          (p: any) => p.id === tabCloakSelect.value,
        );

        if (!selectedPreset) return;

        let title = selectedPreset.title;
        let favicon = selectedPreset.favicon;

        if (tabCloakSelect.value === "custom") {
          title = customTabTitle?.value || title;
          favicon = customTabFavicon?.value || favicon;
        }

        if (title) {
          document.title = title;
        }
        if (favicon) {
          let link = document.querySelector(
            "link[rel~='icon']",
          ) as HTMLLinkElement;
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = favicon;
        }

        if (titlePreview) {
          titlePreview.textContent = title;
        }
        if (faviconPreviewImg && favicon) {
          faviconPreviewImg.src = favicon;
          faviconPreviewImg.classList.remove("hidden");
          faviconPreviewImg.previousElementSibling?.classList.add("hidden");
        }

        await settingsAPI.setItem("tabCloakTitle", title);
        await settingsAPI.setItem("tabCloakFavicon", favicon);
      };

      tabCloakSelect.addEventListener("change", async () => {
        await settingsAPI.setItem("tabCloak", tabCloakSelect.value);
        toggleCustomOptions();
        await applyTabCloak();
        eventsAPI.emit("tabCloak:change", null);
      });

      customTabTitle?.addEventListener("input", async () => {
        await settingsAPI.setItem("customTabTitle", customTabTitle.value);
        await applyTabCloak();
        eventsAPI.emit("tabCloak:change", null);
      });

      customTabFavicon?.addEventListener("input", async () => {
        await settingsAPI.setItem("customTabFavicon", customTabFavicon.value);
        await applyTabCloak();
        eventsAPI.emit("tabCloak:change", null);
      });

      uploadFaviconBtn?.addEventListener("click", () => {
        faviconUpload?.click();
      });

      faviconUpload?.addEventListener("change", async (event: any) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string;
          if (customTabFavicon) {
            customTabFavicon.value = dataUrl;
          }
          await settingsAPI.setItem("customTabFavicon", dataUrl);
          await applyTabCloak();
          eventsAPI.emit("tabCloak:change", null);
        };
        reader.readAsDataURL(file);
      });

      await applyTabCloak();

      console.log("Tab cloak system initialized successfully");
    } catch (error) {
      console.error("Error initializing tab cloak system:", error);
    }
  }

  async function initializeThemeSystem() {
    try {
      console.log("Initializing theme system...");

      const themes = await themeManager.loadThemes();
      console.log("Loaded themes:", Object.keys(themes));

      const themePresetGrid = document.getElementById(
        "themePresetGrid",
      ) as HTMLElement;
      const accentColorGrid = document.getElementById("accentColorGrid");
      const customColorSection = document.getElementById("customColorSection");

      if (!themePresetGrid) {
        console.error("Theme preset grid element not found");
        return;
      }

      let currentTheme =
        (await settingsAPI.getItem("currentTheme")) || "catppuccin-mocha";

      if (!themes[currentTheme]) {
        console.warn(
          `Theme '${currentTheme}' not found in loaded themes, falling back to first available theme`,
        );
        const availableThemes = Object.keys(themes);
        currentTheme =
          availableThemes.length > 0 ? availableThemes[0] : "custom";
      }

      themeManager.setCurrentTheme(currentTheme);

      if (!(await settingsAPI.getItem("currentTheme"))) {
        await settingsAPI.setItem("currentTheme", currentTheme);
        eventsAPI.emit("theme:preset-change", { theme: currentTheme });
      }

      eventsAPI.addEventListener("theme:global-update", async (event: any) => {
        if (!event.detail) {
          console.warn(
            "Received theme:global-update event without detail:",
            event,
          );
          return;
        }

        const { type, theme, color, colorRole } = event.detail;

        console.log(
          "Settings page received global theme update:",
          event.detail,
        );

        if (type === "preset" && theme) {
          currentTheme = theme;
          themeManager.setCurrentTheme(theme);
          await settingsAPI.setItem("currentTheme", theme);

          updateThemeButtonStates(theme);
          updateAccentColors(theme);
          updateColorRoles(theme);
          updateCustomColorVisibility(theme);
        }

        if ((type === "color" || type === "accent") && color) {
          try {
            colorPicker.color.set(color);
          } catch (e) {
            console.warn("Could not update color picker:", e);
          }
        }

        if (type === "colorRole" && colorRole) {
          updateColorRoleStates(colorRole);
        }
      });

      function updateThemeButtonStates(activeThemeKey: string) {
        if (themePresetGrid) {
          themePresetGrid
            .querySelectorAll(".theme-preset-button")
            .forEach((btn) => {
              btn.classList.remove("active");
            });

          const activeButton = Array.from(themePresetGrid.children).find(
            (_, index) => {
              return Object.keys(themes)[index] === activeThemeKey;
            },
          );

          if (activeButton) {
            activeButton.classList.add("active");
          }
        }
      }

      function updateColorRoleStates(selectedRole: string) {
        const colorRoleGrid = document.getElementById("colorRoleGrid");
        if (colorRoleGrid) {
          colorRoleGrid.querySelectorAll("button").forEach((btn) => {
            (btn as HTMLElement).style.borderColor = "var(--white-10)";
            if (btn.textContent === selectedRole) {
              (btn as HTMLElement).style.borderColor = "var(--main)";
            }
          });
        }
      }

      if (themePresetGrid) {
        themePresetGrid.innerHTML = "";

        const themeEntries = Object.entries(themes);
        console.log(
          "Creating theme buttons for:",
          themeEntries.length,
          "themes",
        );

        if (themeEntries.length === 0) {
          console.error("No themes available to display");
          themePresetGrid.innerHTML = `
            <div class="text-red-500 text-sm p-4 border border-red-500 rounded">
              ⚠️ Error: No themes could be loaded. Please check your connection and refresh the page.
            </div>
          `;
          return;
        }

        themeEntries.forEach(([themeKey, theme]) => {
          try {
            const themeButton = themeManager.generateThemePreview(theme);

            if (currentTheme === themeKey) {
              themeButton.classList.add("active");
              console.log("Marked theme as active:", themeKey);
            }

            themeButton.addEventListener("click", async () => {
              console.log("Theme button clicked:", themeKey);
              currentTheme = themeKey;
              await settingsAPI.setItem("currentTheme", themeKey);
              themeManager.setCurrentTheme(themeKey);

              eventsAPI.emit("theme:preset-change", { theme: themeKey });

              updateThemeButtonStates(themeKey);
              updateAccentColors(themeKey);
              updateColorRoles(themeKey);
              updateCustomColorVisibility(themeKey);

              document.documentElement.classList.add("theme-preview-animation");
              setTimeout(() => {
                document.documentElement.classList.remove(
                  "theme-preview-animation",
                );
              }, 400);

              console.log("Theme changed to:", themeKey);
            });

            themePresetGrid.appendChild(themeButton);
          } catch (error) {
            console.error(
              `Failed to create theme button for ${themeKey}:`,
              error,
            );
          }
        });

        updateAccentColors(currentTheme);
        updateColorRoles(currentTheme);
        updateCustomColorVisibility(currentTheme);
      }

      function updateAccentColors(themeKey: string) {
        const accentColors = themeManager.getThemeAccentColors(themeKey);

        if (accentColorGrid && accentColors.length > 0) {
          accentColorGrid.innerHTML = "";

          accentColors.forEach((color) => {
            const button = themeManager.generateAccentColorButton(color);

            button.addEventListener("click", () => {
              accentColorGrid
                .querySelectorAll(".accent-color-button")
                .forEach((btn) => {
                  btn.classList.remove("selected");
                });
              button.classList.add("selected");

              eventsAPI.emit("theme:accent-change", { color });

              console.log("Accent color changed to:", color);
            });

            accentColorGrid.appendChild(button);
          });
        }
      }

      function updateColorRoles(themeKey: string) {
        const themes = themeManager.getAllThemes();
        const theme = themes[themeKey];
        let colorRoleGrid = document.getElementById("colorRoleGrid");

        if (!colorRoleGrid) {
          const colorRoleSection = document.createElement("div");
          colorRoleSection.className = "space-y-3";
          colorRoleSection.innerHTML = `
            <h5 class="text-xs font-medium text-[var(--text)] mb-2">
              Color Roles
            </h5>
            <div id="colorRoleGrid" class="grid grid-cols-3 gap-2">
            </div>
          `;

          const accentSection = document.getElementById("accentColorPalette");
          if (accentSection && accentSection.parentNode) {
            accentSection.parentNode.insertBefore(
              colorRoleSection,
              accentSection.nextSibling,
            );
            colorRoleGrid = document.getElementById("colorRoleGrid");
          }
        }

        if (colorRoleGrid && theme?.["color-roles"]) {
          colorRoleGrid.innerHTML = "";

          Object.entries(theme["color-roles"]).forEach(
            ([roleName, color]: [string, any]) => {
              const button = document.createElement("button");
              button.className =
                "px-3 py-2 rounded-md text-xs font-medium border-2 transition-all duration-200 hover:scale-105";
              button.style.backgroundColor = color;
              button.style.borderColor = "var(--white-10)";
              button.style.color = getContrastTextColor(color);
              button.textContent = roleName;

              button.addEventListener("click", () => {
                eventsAPI.emit("theme:color-role-change", { roleName, color });

                colorRoleGrid.querySelectorAll("button").forEach((btn) => {
                  (btn as HTMLElement).style.borderColor = "var(--white-10)";
                });
                button.style.borderColor = "var(--main)";

                console.log(
                  "Color role changed to:",
                  roleName,
                  "with color:",
                  color,
                );
              });

              colorRoleGrid.appendChild(button);
            },
          );
        }
      }

      function getContrastTextColor(backgroundColor: string): string {
        let hex = backgroundColor;

        if (backgroundColor.startsWith("rgb")) {
          const rgbMatch = backgroundColor.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)/,
          );
          if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 128 ? "#000000" : "#ffffff";
          }
        }

        hex = hex.replace("#", "");

        if (hex.length === 3) {
          hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        } else if (hex.length !== 6) {
          return "#ffffff";
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        if (isNaN(r) || isNaN(g) || isNaN(b)) {
          return "#ffffff";
        }

        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? "#000000" : "#ffffff";
      }

      function updateCustomColorVisibility(themeKey: string) {
        if (customColorSection) {
          if (themeManager.isThemeCustomizable(themeKey)) {
            customColorSection.style.display = "block";
          } else {
            customColorSection.style.display = "none";
          }
        }
      }
    } catch (error) {
      console.error("Failed to initialize theme system:", error);
    }
  }

  async function initializeNewtabSettings() {
    const newtabSelect = document.getElementById(
      "newtabSelect",
    ) as HTMLSelectElement;
    const newtabCustomInput = document.getElementById(
      "newtabCustomInput",
    ) as HTMLElement;
    const newtabCustomUrl = document.getElementById(
      "newtabCustomUrl",
    ) as HTMLInputElement;

    if (!newtabSelect) return;

    const savedPage = (await settingsAPI.getItem("newtabPage")) || "default";
    const savedUrl = (await settingsAPI.getItem("newtabCustomUrl")) || "";

    newtabSelect.value = savedPage;
    if (newtabCustomUrl) newtabCustomUrl.value = savedUrl;

    if (savedPage === "custom") {
      newtabCustomInput?.classList.remove("hidden");
    }

    newtabSelect.addEventListener("change", async () => {
      await settingsAPI.setItem("newtabPage", newtabSelect.value);

      if (newtabSelect.value === "custom") {
        newtabCustomInput?.classList.remove("hidden");
      } else {
        newtabCustomInput?.classList.add("hidden");
      }
    });

    newtabCustomUrl?.addEventListener("change", async () => {
      await settingsAPI.setItem("newtabCustomUrl", newtabCustomUrl.value);
    });
  }

  async function initializeHomeSettings() {
    const homeSelect = document.getElementById(
      "homeSelect",
    ) as HTMLSelectElement;
    const homeCustomInput = document.getElementById(
      "homeCustomInput",
    ) as HTMLElement;
    const homeCustomUrl = document.getElementById(
      "homeCustomUrl",
    ) as HTMLInputElement;

    if (!homeSelect) return;

    const savedUrl = (await settingsAPI.getItem("homeUrl")) || "default";
    const savedCustomUrl = (await settingsAPI.getItem("homeCustomUrl")) || "";

    homeSelect.value = savedUrl;
    if (homeCustomUrl) homeCustomUrl.value = savedCustomUrl;

    if (savedUrl === "custom") {
      homeCustomInput?.classList.remove("hidden");
    }

    homeSelect.addEventListener("change", async () => {
      await settingsAPI.setItem("homeUrl", homeSelect.value);

      if (homeSelect.value === "custom") {
        homeCustomInput?.classList.remove("hidden");
      } else {
        homeCustomInput?.classList.add("hidden");
      }
    });

    homeCustomUrl?.addEventListener("change", async () => {
      await settingsAPI.setItem("homeCustomUrl", homeCustomUrl.value);
    });
  }

  async function initializeStartupSettings() {
    const startupSelect = document.getElementById(
      "startupSelect",
    ) as HTMLSelectElement;
    const startupCustomInput = document.getElementById(
      "startupCustomInput",
    ) as HTMLElement;
    const startupCustomUrl = document.getElementById(
      "startupCustomUrl",
    ) as HTMLInputElement;

    if (!startupSelect) return;

    const savedBehavior =
      (await settingsAPI.getItem("startupBehavior")) || "newtab";
    const savedUrl = (await settingsAPI.getItem("startupCustomUrl")) || "";

    startupSelect.value = savedBehavior;
    if (startupCustomUrl) startupCustomUrl.value = savedUrl;

    if (savedBehavior === "custom") {
      startupCustomInput?.classList.remove("hidden");
    }

    startupSelect.addEventListener("change", async () => {
      await settingsAPI.setItem("startupBehavior", startupSelect.value);

      if (startupSelect.value === "custom") {
        startupCustomInput?.classList.remove("hidden");
      } else {
        startupCustomInput?.classList.add("hidden");
      }
    });

    startupCustomUrl?.addEventListener("change", async () => {
      await settingsAPI.setItem("startupCustomUrl", startupCustomUrl.value);
    });
  }

  await initializeSelect("proxySelect", "proxy", "sj");
  await initializeSelect("transportSelect", "transports", "libcurl");
  await initializeSelect(
    "searchSelect",
    "search",
    "https://duckduckgo.com/?q=%s",
  );
  await initializeSelect("devtools-select", "devtools", "eruda");

  await initializeNewtabSettings();
  await initializeHomeSettings();
  await initializeStartupSettings();
  await initSwitch("searchSuggestionsToggle", "searchSuggestions", null, true);
  await initSwitch("newtabShortcutsToggle", "newtabShowShortcuts", null, true);

  await initializeWispSelect();

  const refluxToggle = document.getElementById(
    "refluxToggle",
  ) as HTMLInputElement;
  if (refluxToggle) {
    const savedRefluxStatus = await settingsAPI.getItem("RefluxStatus");
    if (savedRefluxStatus === null || savedRefluxStatus === undefined) {
      await settingsAPI.setItem("RefluxStatus", "true");
      refluxToggle.checked = true;
    } else {
      refluxToggle.checked = savedRefluxStatus !== "false";
    }

    refluxToggle.addEventListener("change", async () => {
      await settingsAPI.setItem(
        "RefluxStatus",
        refluxToggle.checked.toString(),
      );
      console.log("Reflux toggle changed to:", refluxToggle.checked);
      location.reload();
    });
  }

  async function initializeProxyServerSelect() {
    const proxyServerSelect = document.getElementById(
      "proxyServerSelect",
    ) as HTMLSelectElement;
    const useCustomBtn = document.getElementById(
      "useCustomProxyServer",
    ) as HTMLButtonElement;
    const customInput = document.getElementById(
      "proxyServerCustomInput",
    ) as HTMLElement;
    const customUrlInput = document.getElementById(
      "proxyServerCustomUrl",
    ) as HTMLInputElement;
    const saveCustomBtn = document.getElementById(
      "saveProxyServerCustom",
    ) as HTMLButtonElement;
    const cancelCustomBtn = document.getElementById(
      "cancelProxyServerCustom",
    ) as HTMLButtonElement;

    if (!proxyServerSelect) return;

    const authenticated = await isAuthenticated();

    if (authenticated) {
      try {
        const response = await window.parent.proxy.fetch(
          "https://api.mullvad.net/public/relays/wireguard/v1/",
        );
        const data = JSON.parse(response);

        if (data.countries && Array.isArray(data.countries)) {
          const mullvadOptgroup = document.createElement("optgroup");
          mullvadOptgroup.label = "Mullvad Servers (Requires Night+ VPN)";

          data.countries.forEach((country: any) => {
            if (country.cities && Array.isArray(country.cities)) {
              country.cities.forEach((city: any) => {
                if (city.relays && Array.isArray(city.relays)) {
                  city.relays.forEach((relay: any) => {
                    const hostname = relay.hostname;
                    const parts = hostname.split("-");
                    if (parts.length >= 4) {
                      const nodeNumber = parts[parts.length - 1];
                      const baseHostname = parts.slice(0, -1).join("-");
                      const socksHostname = `${baseHostname}-socks5-${nodeNumber}`;
                      const socksUrl = `socks5h://${socksHostname}.relays.mullvad.net:1080`;

                      const option = document.createElement("option");
                      option.value = socksUrl;
                      option.textContent = `${country.name} - ${city.name} (${hostname})`;
                      mullvadOptgroup.appendChild(option);
                    }
                  });
                }
              });
            }
          });

          proxyServerSelect.appendChild(mullvadOptgroup);
        }
      } catch (error) {
        console.error("Failed to fetch Mullvad relays:", error);
      }
    }

    const savedProxyServer = (await settingsAPI.getItem("proxyServer")) || "";

    if (
      savedProxyServer &&
      !Array.from(proxyServerSelect.options).some(
        (opt) => opt.value === savedProxyServer,
      )
    ) {
      proxyServerSelect.value = "custom";
      if (customUrlInput) customUrlInput.value = savedProxyServer;
    } else {
      proxyServerSelect.value = savedProxyServer;
    }

    proxyServerSelect.addEventListener("change", async () => {
      if (proxyServerSelect.value === "custom") {
        customInput?.classList.remove("hidden");
        useCustomBtn.style.display = "none";
      } else {
        customInput?.classList.add("hidden");
        useCustomBtn.style.display = "block";
        await settingsAPI.setItem("proxyServer", proxyServerSelect.value);
        if (proxyServerSelect.value !== "") {
          location.reload();
        }
      }
    });

    useCustomBtn?.addEventListener("click", () => {
      proxyServerSelect.value = "custom";
      customInput?.classList.remove("hidden");
      useCustomBtn.style.display = "none";
    });

    saveCustomBtn?.addEventListener("click", async () => {
      const customValue = customUrlInput?.value.trim() || "";
      await settingsAPI.setItem("proxyServer", customValue);
      customInput?.classList.add("hidden");
      useCustomBtn.style.display = "block";

      const existingCustomOption = Array.from(proxyServerSelect.options).find(
        (opt) => opt.value === "custom",
      );
      if (!existingCustomOption) {
        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = `Custom: ${customValue}`;
        proxyServerSelect.appendChild(customOption);
      }

      proxyServerSelect.value = "custom";
      location.reload();
    });

    cancelCustomBtn?.addEventListener("click", () => {
      customInput?.classList.add("hidden");
      useCustomBtn.style.display = "block";
      proxyServerSelect.value = savedProxyServer;
    });
  }

  await initializeProxyServerSelect();

  initButton("bgUpload", () => {
    const uploadBGInput = document.getElementById(
      "bgInput",
    ) as HTMLInputElement;
    uploadBGInput!.click();
  });

  initButton("bgRemove", async () => {
    await settingsAPI.removeItem("theme:background-image");
    eventsAPI.emit("theme:background-change", null);
  });
});

const uploadBGInput = document.getElementById("bgInput") as HTMLInputElement;

if (uploadBGInput) {
  uploadBGInput.addEventListener("change", function (event: any) {
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = async function (e) {
      var backgroundImage = e.target!.result;
      await settingsAPI.setItem(
        "theme:background-image",
        backgroundImage as string,
      );
      eventsAPI.emit("theme:background-change", null);
    };
    reader.readAsDataURL(file);
  });
}

const panicKeybindInput = document.getElementById(
  "panicKeybind",
) as HTMLInputElement;
const panicKey = panicKeybindInput?.getAttribute("data-key") || "panicKeybind";

const keybindManager = new KeybindManager(settingsAPI);

document.addEventListener("DOMContentLoaded", async () => {
  if (panicKeybindInput) {
    const savedKeybind = (await settingsAPI.getItem(panicKey)) || "`";
    panicKeybindInput.value = savedKeybind;
    panicKeybindInput.addEventListener("change", async () => {
      await settingsAPI.setItem(panicKey, panicKeybindInput.value);
      console.log("Panic keybind changed to:", panicKeybindInput.value);
    });
  }

  await settingsAPI.removeItem("keybinds");
  await keybindManager.loadKeybinds();
});

function initializeKeybindsUI() {
  const container = document.getElementById("keybinds-container");
  if (!container) return;

  KEYBIND_CATEGORIES.forEach((category) => {
    const categoryKeybinds = keybindManager.getKeybindsByCategory(
      category.name,
    );

    if (Object.keys(categoryKeybinds).length === 0) return;

    const categorySection = document.createElement("div");
    categorySection.className = "space-y-3";
    categorySection.innerHTML = `
      <h3 class="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
        <i data-lucide="${category.icon || "folder"}" class="h-4 w-4"></i>
        ${category.label}
      </h3>
      <div class="space-y-2" data-category="${category.name}"></div>
    `;

    const keybindsList = categorySection.querySelector(
      `[data-category="${category.name}"]`,
    );

    Object.entries(categoryKeybinds).forEach(([id, config]) => {
      const keybindRow = document.createElement("div");
      keybindRow.className =
        "bg-[var(--bg-1)] rounded-lg p-4 ring-1 ring-inset ring-[var(--white-08)] flex items-center justify-between gap-4";
      keybindRow.innerHTML = `
        <div class="flex-1">
          <div class="text-sm text-[var(--text)]">${config.description}</div>
        </div>
        <div class="flex items-center gap-2">
          <button
            data-keybind-id="${id}"
            class="keybind-display px-3 py-1.5 text-xs rounded-md bg-[var(--bg-2)] border border-[var(--white-10)] text-[var(--text)] hover:bg-[var(--white-05)] transition-colors font-mono"
          >
            ${keybindManager.formatKeybind(config)}
          </button>
          <button
            data-reset-keybind="${id}"
            class="p-1.5 text-xs rounded-md text-[var(--proto)] hover:text-[var(--text)] hover:bg-[var(--white-05)] transition-colors"
            title="Reset to default"
          >
            <i data-lucide="rotate-ccw" class="h-4 w-4"></i>
          </button>
        </div>
      `;

      keybindsList?.appendChild(keybindRow);
    });

    container.appendChild(categorySection);
  });

  createIcons({ icons });

  container.querySelectorAll(".keybind-display").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const keybindId = target.dataset.keybindId;
      if (keybindId) startKeybindCapture(keybindId, target);
    });
  });

  container.querySelectorAll("[data-reset-keybind]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const keybindId = target.dataset.resetKeybind;
      if (keybindId) {
        keybindManager.resetKeybind(keybindId);
        refreshKeybindsUI();
        window.opener?.postMessage({ type: "keybinds-updated" }, "*");
      }
    });
  });

  document
    .getElementById("reset-all-keybinds")
    ?.addEventListener("click", async () => {
      if (confirm("Are you sure you want to reset all keybinds to defaults?")) {
        keybindManager.resetAllKeybinds();
        refreshKeybindsUI();
        window.opener?.postMessage({ type: "keybinds-updated" }, "*");
      }
    });
}

function startKeybindCapture(keybindId: string, button: HTMLButtonElement) {
  button.textContent = "Press key...";
  button.classList.add("ring-2", "ring-[var(--main)]");

  const keyboardManager = (window as any).functions?.keyboardManager;
  if (keyboardManager) {
    keyboardManager.captureMode = true;
  }

  const originalKeybind = keybindManager.getAllKeybinds()[keybindId];

  const preventAll = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    preventAll(e);

    if (e.key === "Escape") {
      cleanup();
      return;
    }

    const modifierKeys = [
      "Control",
      "Alt",
      "Shift",
      "Meta",
      "AltGraph",
      "CapsLock",
      "Fn",
      "FnLock",
      "Hyper",
      "NumLock",
      "ScrollLock",
      "Super",
      "Symbol",
      "SymbolLock",
    ];
    if (modifierKeys.includes(e.key)) {
      return;
    }

    const newConfig = {
      ...originalKeybind,
      key: e.key,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      shift: e.shiftKey,
    };

    const conflicts = keybindManager.getConflicts(newConfig, keybindId);

    if (conflicts.length > 0) {
      const conflictKeybind = keybindManager.getAllKeybinds()[conflicts[0]];
      if (
        !confirm(
          `This keybind conflicts with "${conflictKeybind.description}". Override?`,
        )
      ) {
        cleanup();
        return;
      }
    }

    keybindManager.setKeybind(keybindId, newConfig);
    cleanup();
    refreshKeybindsUI();

    window.opener?.postMessage({ type: "keybinds-updated" }, "*");
  };

  const cleanup = () => {
    const keyboardManager = (window as any).functions?.keyboardManager;
    if (keyboardManager) {
      keyboardManager.captureMode = false;
    }
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("keyup", preventAll, true);
    window.removeEventListener("keypress", preventAll, true);
    document.removeEventListener("contextmenu", preventAll, true);
    button.classList.remove("ring-2", "ring-[var(--main)]");
    button.textContent = keybindManager.formatKeybind(originalKeybind);
  };

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", preventAll, true);
  window.addEventListener("keypress", preventAll, true);
  document.addEventListener("contextmenu", preventAll, true);
}

function refreshKeybindsUI() {
  const container = document.getElementById("keybinds-container");
  if (!container) return;
  container.innerHTML = "";
  initializeKeybindsUI();
}

document.addEventListener("DOMContentLoaded", async () => {
  await keybindManager.loadKeybinds();
  initializeKeybindsUI();
});
