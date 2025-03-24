import { SettingsAPI } from "/assets/js/apis/settings.js";
import { EventSystem } from "/assets/js/apis/events.js";
import { DataExportAPI } from "/assets/js/apis/exporting.js";
import { Global } from "/assets/js/global/index.js";
import { Nightmare } from "/assets/js/lib/Nightmare/nightmare.js";

const settingsAPI = new SettingsAPI();
const dataExportAPI = new DataExportAPI();
const eventsAPI = new EventSystem();
const globalFunctions = new Global();
const nightmare = new Nightmare();

// ^ imports / constant defintions / class initializations

const initializeDropdown = async (
  buttonId,
  optionsId,
  settingsKey,
  defaultValue,
  functions = null,
) => {
  const dropdownButton = document.getElementById(buttonId);
  const dropdownOptions = document.getElementById(optionsId);
  const buttonText = dropdownButton?.querySelector(".button-text");

  if (!dropdownButton) {
    console.error(`Dropdown button with id "${buttonId}" not found.`);
    return;
  }
  if (!dropdownOptions) {
    console.error(`Dropdown options with id "${optionsId}" not found.`);
    return;
  }
  if (!buttonText) {
    console.error(
      `Button text element not found within dropdown button with id "${buttonId}".`,
    );
    return;
  }

  const savedValue = (await settingsAPI.getItem(settingsKey)) || defaultValue;
  const selectedOption = dropdownOptions.querySelector(
    `[data-value="${savedValue}"]`,
  );
  if (selectedOption) {
    buttonText.textContent = selectedOption.textContent;
  } else {
    console.warn(
      `No option found for value "${savedValue}" in dropdown with id "${optionsId}".`,
    );
  }

  dropdownButton.addEventListener("click", () => {
    document.querySelectorAll(".dropdown-options").forEach((dropdown) => {
      if (dropdown !== dropdownOptions) {
        dropdown.style.opacity = "0";
        dropdown.style.filter = "blur(5px)";
        setTimeout(() => {
          dropdown.style.display = "none";
        }, 200);
      }
    });
    document.querySelectorAll(".dropdown-button.active").forEach((btn) => {
      if (btn !== dropdownButton) {
        btn.classList.remove("active");
      }
    });

    const isVisible = dropdownOptions.style.display === "block";
    if (!isVisible) {
      dropdownOptions.style.display = "block";
      setTimeout(() => {
        dropdownOptions.style.opacity = "1";
        dropdownOptions.style.filter = "blur(0px)";
      }, 10);
    } else {
      dropdownOptions.style.opacity = "0";
      dropdownOptions.style.filter = "blur(5px)";
      setTimeout(() => {
        dropdownOptions.style.display = "none";
      }, 200);
    }
    dropdownButton.classList.toggle("active", !isVisible);
  });

  dropdownOptions.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      let selectedValue = event.target.getAttribute("data-value");
      const selectedOption = event.target.textContent;
      buttonText.textContent = selectedOption;
      settingsAPI.setItem(settingsKey, selectedValue);
      dropdownOptions.style.opacity = "0";
      dropdownOptions.style.filter = "blur(5px)";
      setTimeout(() => {
        dropdownOptions.style.display = "none";
      }, 200);
      dropdownButton.classList.remove("active");

      if (functions != null ?? undefined) {
        functions();
      }
      location.reload();
    }
  });
};

document.addEventListener("click", (event) => {
  if (!event.target.closest(".dropdown")) {
    document.querySelectorAll(".dropdown-button.active").forEach((btn) => {
      btn.classList.remove("active");
      const dropdownOptions = btn.nextElementSibling;
      if (dropdownOptions) {
        dropdownOptions.style.opacity = "0";
        dropdownOptions.style.filter = "blur(5px)";
        setTimeout(() => {
          dropdownOptions.style.display = "none";
        }, 200);
      }
    });
  }
});
const initSwitch = async (item, setting, functionToCall) => {
  const switchElement = item;
  if (!switchElement) {
    console.error(`Switch element at ${item} not found.`);
    return;
  }
  switchElement.checked = (await settingsAPI.getItem(setting)) === "true";
  switchElement.addEventListener("change", async () => {
    await settingsAPI.setItem(setting, switchElement.checked.toString());
    if (functionToCall) {
      await functionToCall();
    }
  });
};

const uploadBGInput = document.getElementById("bgInput");
const uploadBGButton = document.getElementById("bgUpload");

uploadBGButton.addEventListener("click", function () {
  uploadBGInput.click();
});

uploadBGInput.addEventListener("change", function (event) {
  var file = event.target.files[0];
  var reader = new FileReader();
  reader.onload = async function (e) {
    var backgroundImage = e.target.result;
    await settingsAPI.setItem("theme:background-image", backgroundImage);
    eventsAPI.emit("theme:background-change");
  };
  reader.readAsDataURL(file);
});

document.addEventListener("DOMContentLoaded", async () => {
  //Cloaking
  initializeDropdown("tabCloakButton", "tabCloakOptions", "tabCloak", "off");
  initializeDropdown("URL-cloakButton", "URL-cloakOptions", "URL_Cloak", "off");
  initSwitch(
    document.getElementById("autoCloakSwitch"),
    "autoCloak",
    function () {
      eventsAPI.emit("cloaking:auto-toggle");
    },
  );

  //Apperance
  initializeDropdown(
    "tabLayoutButton",
    "tabLayoutOptions",
    "verticalTabs",
    "false",
    () => {
      eventsAPI.emit("UI:changeLayout");
      setTimeout(() => {
        eventsAPI.emit("UI:changeLayout");
      }, 100);
    },
  );
  initializeDropdown(
    "UIStyleButton",
    "UIStyleOptions",
    "UIStyle",
    "operagx",
    () => {
      eventsAPI.emit("UI:changeStyle");
      eventsAPI.emit("theme:template-change");
      setTimeout(() => {
        eventsAPI.emit("UI:changeStyle");
        eventsAPI.emit("theme:template-change");
      }, 100);
    },
  );
  var colorPicker = new iro.ColorPicker(".colorPicker", {
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

  colorPicker.on("input:change", async function (color) {
    eventsAPI.emit("theme:color-change", { color: color.rgbaString });
  });

  initializeDropdown(
    "themeButtonCustom",
    "themeOptionsCustom",
    "themeCustom",
    "dark",
    function () {
      eventsAPI.emit("theme:template-change");
      setTimeout(() => {
        eventsAPI.emit("theme:template-change");
      }, 100);
    },
  );

  // Searching
  initializeDropdown("proxyButton", "proxyOptions", "proxy", "uv");
  initializeDropdown(
    "transportButton",
    "transportOptions",
    "transports",
    "libcurl",
  );
  initializeDropdown(
    "searchButton",
    "searchOptions",
    "search",
    "https://duckduckgo.com/?q=%s",
  );

  // Load and handle visibility of wisp and bare settings
  const wispSetting = document.getElementById("wispSetting");
  if (wispSetting) {
    wispSetting.value =
      (await settingsAPI.getItem("wisp")) ||
      (location.protocol === "https:" ? "wss" : "ws") +
        "://" +
        location.host +
        "/wisp/";
  }

  // Add event listener to save wisp and bare settings
  const saveInputValue = (inputId, settingsKey) => {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) {
      console.error(`Input element with id "${inputId}" not found.`);
      return;
    }

    inputElement.addEventListener("change", async () => {
      await settingsAPI.setItem(settingsKey, inputElement.value);
      location.reload();
    });
    inputElement.addEventListener("keypress", async (event) => {
      if (event.key === "Enter") {
        await settingsAPI.setItem(settingsKey, inputElement.value);
        location.reload();
      }
    });
  };

  saveInputValue("wispSetting", "wisp");
});

function saveInputValueAsButton(button, input, key) {
  if (!input) {
    console.error(`Input element with id "${id}" not found.`);
    return;
  }

  button.addEventListener("click", async () => {
    await settingsAPI.setItem(key, input.value);
    location.reload();
  });
}

saveInputValueAsButton(
  document.getElementById("saveWispSetting"),
  document.getElementById("wispSetting"),
  "wisp",
);

document
  .getElementById("resetWispSetting")
  .addEventListener("click", async () => {
    await settingsAPI.removeItem("wisp");
    location.reload();
  });
