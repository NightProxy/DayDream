import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "../../js/global/theming.ts";
import "basecoat-css/all";
import { SettingsAPI } from "@apis/settings";
import { ProfilesAPI } from "@apis/profiles";
import { EventSystem } from "@apis/events";
import iro from "@jaames/iro";
import { themeManager } from "@js/utils/themeManager";
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
) => {
  const switchElement = document.getElementById(switchId) as HTMLInputElement;

  if (!switchElement) {
    console.error(`Switch element with id "${switchId}" not found.`);
    return;
  }

  const savedValue = await settingsAPI.getItem(settingsKey);
  switchElement.checked = savedValue === "true";

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

  await initializeSelect("tabCloakSelect", "tabCloak", "off");
  await initializeSelect("URL-cloakSelect", "URL_Cloak", "off");

  await initSwitch("autoCloakSwitch", "autoCloak", () => {
    eventsAPI.emit("cloaking:auto-toggle", null);
  });

  await initSwitch("antiCloseSwitch", "antiClose", null);

  await initializeSelect("UIStyleSelect", "UIStyle", "operagx", () => {
    eventsAPI.emit("UI:changeStyle", null);
    eventsAPI.emit("theme:template-change", null);
    setTimeout(() => {
      eventsAPI.emit("UI:changeStyle", null);
      eventsAPI.emit("theme:template-change", null);
    }, 100);
  });

  var colorPicker = new (iro.ColorPicker as any)(".colorPicker", {
    width: 80,
    color: (await settingsAPI.getItem("themeColor")) || "rgba(141, 1, 255, 1)",
    borderWidth: 0,
    layoutDirection: "horizontal",
    layout: [
      {
        component: iro.ui.Box,
      },
      {
        component: iro.ui.Slider,
        options: {
          sliderType: "hue",
        },
      },
    ],
  });

  colorPicker.on("input:change", async function (color: any) {
    eventsAPI.emit("theme:color-change", { color: color.rgbaString });
    console.log("Custom color changed to:", color.rgbaString);
  });

  await initializeThemeSystem();

  async function initializeThemeSystem() {
    try {
      const themes = await themeManager.loadThemes();

      const themeGrid = document.querySelector(".theme-grid") as HTMLElement;
      const themePresetGrid = document.querySelector(
        ".theme-preset-grid",
      ) as HTMLElement;
      const accentColorGrid = document.getElementById("accentColorGrid");
      const customColorSection = document.getElementById("customColorSection");

      // Default to Catppuccin Mocha if no theme is set
      let currentTheme =
        (await settingsAPI.getItem("currentTheme")) || "catppuccin-mocha";
      themeManager.setCurrentTheme(currentTheme);

      if (!(await settingsAPI.getItem("currentTheme"))) {
        await settingsAPI.setItem("currentTheme", "catppuccin-mocha");
        eventsAPI.emit("theme:preset-change", { theme: "catppuccin-mocha" });
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

          // Update UI without emitting duplicate events
          updateThemeButtonStates(theme);
          updateAccentColors(theme);
          updateColorRoles(theme);
          updateCustomColorVisibility(theme);
        }

        if ((type === "color" || type === "accent") && color) {
          // Update color picker if needed
          try {
            colorPicker.color.set(color);
          } catch (e) {
            console.warn("Could not update color picker:", e);
          }
        }

        if (type === "colorRole" && colorRole) {
          // Handle color role changes
          updateColorRoleStates(colorRole);
        }
      });

      // Helper function to update theme button states
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

      // Helper function to update color role selection states
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

        Object.entries(themes).forEach(([themeKey, theme]) => {
          const themeButton = themeManager.generateThemePreview(theme);

          // Add active state if current theme
          if (currentTheme === themeKey) {
            themeButton.classList.add("active");
          }

          // Add click handler with proper event emission
          themeButton.addEventListener("click", async () => {
            currentTheme = themeKey;
            await settingsAPI.setItem("currentTheme", themeKey);
            themeManager.setCurrentTheme(themeKey);

            // Emit local theme preset change (this will trigger global update)
            eventsAPI.emit("theme:preset-change", { theme: themeKey });

            // Update local UI immediately
            updateThemeButtonStates(themeKey);
            updateAccentColors(themeKey);
            updateColorRoles(themeKey);
            updateCustomColorVisibility(themeKey);

            // Add preview animation
            document.documentElement.classList.add("theme-preview-animation");
            setTimeout(() => {
              document.documentElement.classList.remove(
                "theme-preview-animation",
              );
            }, 400);

            console.log("Theme changed to:", themeKey);
          });

          themePresetGrid.appendChild(themeButton);
        });

        // Initialize accent colors for current theme
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

            // Update accent color buttons with proper event emission
            button.addEventListener("click", () => {
              // Update selection state locally
              accentColorGrid
                .querySelectorAll(".accent-color-button")
                .forEach((btn) => {
                  btn.classList.remove("selected");
                });
              button.classList.add("selected");

              // Emit local accent change (this will trigger global update)
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
          // Create color role section if it doesn't exist
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

              // Add click handler with proper event emission
              button.addEventListener("click", () => {
                // Emit local color role change (this will trigger global update)
                eventsAPI.emit("theme:color-role-change", { roleName, color });

                // Update button states locally
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
        // Simple function to determine if text should be black or white
        const hex = backgroundColor.replace("#", "");
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 6), 16);
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

  await initializeSelect("proxySelect", "proxy", "uv");
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
