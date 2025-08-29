import "../../css/vars.css";
import "../../css/imports.css";
import "../../css/global.css";
import "basecoat-css/all";
import { createIcons, icons } from "lucide";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { DDXGlobal } from "@js/global";
import iro from "@jaames/iro";

const settingsAPI = new SettingsAPI();
const eventsAPI = new EventSystem();
const globalFunctions = new DDXGlobal();

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
  createIcons({ icons });

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
  });

  await initializeSelect("themeCustomSelect", "themeCustom", "dark", () => {
    eventsAPI.emit("theme:template-change", null);
    setTimeout(() => {
      eventsAPI.emit("theme:template-change", null);
    }, 100);
  });

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
