const settingsAPI = new SettingsAPI();
const dataExportAPI = new DataExportAPI();
const eventsAPI = new EventSystem();
const globalFunctions = new Global(settingsAPI);

const initializeDropdown = async (
  buttonId,
  optionsId,
  settingsKey,
  defaultValue,
  eventName
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
    const isVisible = dropdownOptions.style.display === "block";
    dropdownOptions.style.display = isVisible ? "none" : "block";
    dropdownButton.classList.toggle("active", !isVisible);
  });

  dropdownOptions.addEventListener("click", (event) => {
    if (event.target.tagName === "A") {
      const selectedValue = event.target.getAttribute("data-value");
      const selectedOption = event.target.textContent;
      buttonText.textContent = selectedOption;
      settingsAPI.setItem(settingsKey, selectedValue);
      dropdownOptions.style.display = "none";
      dropdownButton.classList.remove("active");

      if (eventName != null ?? undefined) {
        eventsAPI.emit(eventName, { dropdownValue: selectedValue });
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
        dropdownOptions.style.display = "none";
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  //Themeing
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
    "theme-custom:template-change",
  );

  document.getElementById('bgInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const dataUrl = e.target.result;
        await settingsAPI.setItem('backgroundImage', dataUrl);
        eventsAPI.emit('theme:background-change', { backgroundImage: dataUrl });
      };
      reader.readAsDataURL(file); 
    }
  });

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
    "https://google.com/search?q=%s",
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

document.addEventListener("DOMContentLoaded", function () {
  let importButton = document.getElementById("importData");
  let exportButton = document.getElementById("exportData");

  importButton.addEventListener("click", function () {
    document.getElementById("dataInput").click();
  });
  exportButton.addEventListener("click", function () {
    dataExportAPI.exportData();
  });
});
