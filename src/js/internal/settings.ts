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
const settingsAPI = new SettingsAPI();
const eventsAPI = new EventSystem();
import { createIcons, icons } from "lucide";

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

const initTextInput = async (
  inputId: string,
  settingsKey: string,
  defaultValue: string = "",
) => {
  const inputElement = document.getElementById(inputId) as HTMLInputElement;

  if (!inputElement) {
    console.error(`Input element with id "${inputId}" not found.`);
    return;
  }

  const savedValue = (await settingsAPI.getItem(settingsKey)) || defaultValue;
  inputElement.value = savedValue;

  inputElement.addEventListener("change", async () => {
    await settingsAPI.setItem(settingsKey, inputElement.value);
  });

  inputElement.addEventListener("keypress", async (event) => {
    if (event.key === "Enter") {
      await settingsAPI.setItem(settingsKey, inputElement.value);
      location.reload();
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

  colorPicker.on("input:change", (color: any) => {
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

  await initializeSelect("proxySelect", "proxy", "sj");
  await initializeSelect("transportSelect", "transports", "libcurl");
  await initializeSelect(
    "searchSelect",
    "search",
    "https://duckduckgo.com/?q=%s",
  );

  const defaultWispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  await initTextInput("wispSetting", "wisp", defaultWispUrl);

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

  await initTextInput("proxyServerSetting", "prx-server", "");

  initButton("saveProxyServerSetting", async () => {
    const proxyServerInput = document.getElementById(
      "proxyServerSetting",
    ) as HTMLInputElement;
    const value = proxyServerInput.value.trim();
    await settingsAPI.setItem("prx-server", value);
    console.log("Remote proxy server saved:", value);
    location.reload();
  });

  initButton("resetProxyServerSetting", async () => {
    await settingsAPI.setItem("prx-server", "");
    const proxyServerInput = document.getElementById(
      "proxyServerSetting",
    ) as HTMLInputElement;
    proxyServerInput.value = "";
    console.log("Remote proxy server disabled");
    location.reload();
  });

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

  initButton("saveWispSetting", async () => {
    const wispInput = document.getElementById(
      "wispSetting",
    ) as HTMLInputElement;
    await settingsAPI.setItem("wisp", wispInput.value);
    location.reload();
  });

  initButton("resetWispSetting", async () => {
    await settingsAPI.removeItem("wisp");
    location.reload();
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

document.addEventListener("DOMContentLoaded", async () => {
  if (panicKeybindInput) {
    const savedKeybind = (await settingsAPI.getItem(panicKey)) || "`";
    panicKeybindInput.value = savedKeybind;
    panicKeybindInput.addEventListener("change", async () => {
      await settingsAPI.setItem(panicKey, panicKeybindInput.value);
      console.log("Panic keybind changed to:", panicKeybindInput.value);
    });
  }
});
