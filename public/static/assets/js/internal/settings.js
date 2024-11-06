const settingsAPI = new SettingsAPI();
const dataExportAPI = new DataExportAPI();
const globalFunctions = new Global(settingsAPI);

document.addEventListener("DOMContentLoaded", async () => {
  var colorPicker = new iro.ColorPicker(".colorPicker", {
    width: 160,
    color: await settingsAPI.getItem("themeColor") || "#aa00ff",
    borderWidth: 0,
    layoutDirection: "horizontal",
    layout: [
      {
        component: iro.ui.Box,
      },
      {
        component: iro.ui.Slider,
        options: {
          sliderType: 'hue'
        }
      }
    ]
  });

  colorPicker.on("input:change", async function (color) {
    settingsAPI.setItem("themeColor", color.hexString);
    document.documentElement.style.setProperty("--main-color", await settingsAPI.getItem("themeColor") || color.hexString);
  });
  // Function to initialize a dropdown
  const initializeDropdown = async (
    buttonId,
    optionsId,
    settingsKey,
    defaultValue,
  ) => {
    const dropdownButton = document.getElementById(buttonId);
    const dropdownOptions = document.getElementById(optionsId);
    const buttonText = dropdownButton?.querySelector(".button-text");

    // Check if dropdown components exist
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

    // Load saved value
    const savedValue = await settingsAPI.getItem(settingsKey) || defaultValue;
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

    // Toggle dropdown visibility and active class
    dropdownButton.addEventListener("click", () => {
      const isVisible = dropdownOptions.style.display === "block";
      dropdownOptions.style.display = isVisible ? "none" : "block";
      dropdownButton.classList.toggle("active", !isVisible);
    });

    // Handle click events on dropdown options
    dropdownOptions.addEventListener("click", (event) => {
      if (event.target.tagName === "A") {
        const selectedValue = event.target.getAttribute("data-value");
        const selectedOption = event.target.textContent;
        buttonText.textContent = selectedOption;
        settingsAPI.setItem(settingsKey, selectedValue);
        dropdownOptions.style.display = "none";
        dropdownButton.classList.remove("active");

        // Refresh the page based on the new value
        location.reload();
      }
    });
  };

  // Function to close all dropdowns if clicking outside
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

  // Initialize each dropdown on the page
  initializeDropdown("proxyButton", "proxyOptions", "proxy", "uv");
  initializeDropdown(
    "transportButton",
    "transportOptions",
    "transports",
    "epoxy",
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
    wispSetting.value = settingsAPI.getItem("wisp") || "";
  }

  // Add event listener to save wisp and bare settings
  const saveInputValue = (inputId, settingsKey) => {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) {
      console.error(`Input element with id "${inputId}" not found.`);
      return;
    }

    inputElement.addEventListener("change", () => {
      settingsAPI.setItem(settingsKey, inputElement.value);
      location.reload();
    });
    inputElement.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        settingsAPI.setItem(settingsKey, inputElement.value);
        location.reload();
      }
    });
  };

  saveInputValue("wispSetting", "wisp");
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
