document.addEventListener("DOMContentLoaded", () => {
  // Function to initialize a dropdown
  const initializeDropdown = (
    buttonId,
    optionsId,
    localStorageKey,
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
    const savedValue = localStorage.getItem(localStorageKey) || defaultValue;
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
        localStorage.setItem(localStorageKey, selectedValue); // Save to localStorage
        dropdownOptions.style.display = "none"; // Hide dropdown options
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
    wispSetting.value = localStorage.getItem("wisp") || "";
  }

  // Add event listener to save wisp and bare settings
  const saveInputValue = (inputId, localStorageKey) => {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) {
      console.error(`Input element with id "${inputId}" not found.`);
      return;
    }

    inputElement.addEventListener("change", () => {
      localStorage.setItem(localStorageKey, inputElement.value);
      location.reload();
    });
    inputElement.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        localStorage.setItem(localStorageKey, inputElement.value);
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
    api.settings.exportData();
  });
});
