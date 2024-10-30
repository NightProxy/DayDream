function showPageFromHash() {
  let hash = window.location.hash.slice(1);
  console.log("Original hash:", hash);
  if (hash.startsWith("/")) {
    hash = hash.slice(1);
  }
  console.log("Processed hash:", hash);

  const pages = document.querySelectorAll(".scontent");
  let pageToShow = document.getElementById("cloak"); // Default to 'blank' if no valid page is found

  // Hide all pages
  pages.forEach((page) => {
    page.style.display = "none";
  });

  if (hash) {
    // Show the target page if it exists
    const targetPage = document.getElementById(hash);
    if (targetPage) {
      pageToShow = targetPage;
      console.log("Showing page:", targetPage);
      pageToShow.style.display = "block";
    } else {
      console.log("No page found for hash:", hash);
    }
  } else {
    console.log("No hash found, showing blank page.");
    pageToShow.style.display = "block";
  }

  const settingItems = document.querySelectorAll(".settingItem");
  let foundActive = false;

  // Update setting items
  settingItems.forEach((item) => {
    if (item.dataset.id === hash) {
      item.classList.add("sideActive");
      foundActive = true;
    } else {
      item.classList.remove("sideActive");
    }
  });

  // Default to 'blank' settingItem if no valid settingItem matches the hash
  if (!foundActive) {
    const defaultSettingItem = document.querySelector(
      '.settingItem[data-id="cloak"]',
    );
    if (defaultSettingItem) {
      defaultSettingItem.classList.add("sideActive");
    }
  }
}

// Initial state to hide all pages except 'blank'
document.addEventListener("DOMContentLoaded", () => {
  const pages = document.querySelectorAll(".scontent");
  pages.forEach((page) => {
    page.style.display = "none";
  });
  document.getElementById("cloak").style.display = "block";
  showPageFromHash(); // Show the page based on the initial hash
});

window.addEventListener("load", showPageFromHash);
window.addEventListener("hashchange", showPageFromHash);

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
  initializeDropdown("browseButton", "browseOptions", "browse", "tabs");

  // Load and handle visibility of wisp and bare settings
  const wispSetting = document.getElementById("wispSetting");
  const bareSetting = document.getElementById("bareSetting");
  if (wispSetting) {
    wispSetting.value = localStorage.getItem("wisp") || "";
  }
  if (bareSetting) {
    bareSetting.value = localStorage.getItem("bare") || "";
  }

  const updateTransportVisibility = () => {
    const transportValue = localStorage.getItem("transports") || "epoxy";
    const wispDiv = document.getElementById("wispDiv");
    const bareDiv = document.getElementById("bareDiv");
    if (wispDiv) {
      wispDiv.style.display = transportValue === "baremod" ? "none" : "block";
    }
    if (bareDiv) {
      bareDiv.style.display = transportValue === "baremod" ? "block" : "none";
    }
  };
  updateTransportVisibility();

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
  saveInputValue("bareSetting", "bare");
});

function openB() {
  if (window === window.top) {
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body, html {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    overflow: hidden;
                }
                iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                }
            </style>
        </head>
        <body>
            <iframe src="${location.href}" frameborder="0"></iframe>
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    // Open the Blob URL in a new tab
    window.open(blobUrl, "_blank");
  } else {
    console.log("already in blob or iframe");
    alert("already in blob or iframe");
  }
}

function createAboutBlankWindow(url) {
  return window.open("about:blank");
}

function openAB() {
  if (window === window.top) {
    const aboutBlankWindow = createAboutBlankWindow();
    const iframe = document.createElement("iframe");
    iframe.src = window.location.href;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.frameborder = "0";
    iframe.style.marginwidth = "0";
    iframe.style.position = "fixed";
    iframe.style.inset = "0px";
    iframe.style.outline = "none";
    iframe.style.scrolling = "auto";
    /*  aboutBlankWindow.document.title = document.title;*/
    const link = aboutBlankWindow.document.createElement("link");
    link.rel = "icon";
    link.type = "image/x-icon";
    link.href =
      localStorage.getItem("favicon") ||
      location.href + "/assets/imgs/icons/default.ico";
    aboutBlankWindow.document.head.appendChild(link);
    aboutBlankWindow.document.body.appendChild(iframe);
    // window.location.href = localStorage.redirectLink;
  } else {
    console.log("already in about:blank or iframe");
    alert("already in about:blank or iframe");
  }
}

let autoOpen = localStorage.getItem("autoOpen");

if (autoOpen == "about:blank") {
  openAB();
} else if (autoOpen == "blob") {
  openB();
}

const autoOpenSwitch = document.getElementById("abSwitch");
const otherSwitch = document.getElementById("blobSwitch");

function updateSwitches() {
  const autoOpen = localStorage.getItem("autoOpen");

  if (autoOpen === "about:blank") {
    autoOpenSwitch.checked = true;
    otherSwitch.checked = false;
  } else if (autoOpen === "blob") {
    autoOpenSwitch.checked = false;
    otherSwitch.checked = true;
  } else {
    autoOpenSwitch.checked = false;
    otherSwitch.checked = false;
  }
}

function handleSwitchChange(clickedSwitch) {
  // Determine the state to save based on which switch was clicked
  let newState;

  if (clickedSwitch === autoOpenSwitch) {
    newState = autoOpenSwitch.checked ? "about:blank" : "disabled";
    otherSwitch.checked = !autoOpenSwitch.checked;
  } else if (clickedSwitch === otherSwitch) {
    newState = otherSwitch.checked ? "blob" : "disabled";
    autoOpenSwitch.checked = !otherSwitch.checked;
  }

  localStorage.setItem("autoOpen", newState);
}

autoOpenSwitch.addEventListener("change", () =>
  handleSwitchChange(autoOpenSwitch),
);
otherSwitch.addEventListener("change", () => handleSwitchChange(otherSwitch));
document.getElementById("cloakDisable").addEventListener("click", () => {
  localStorage.setItem("autoOpen", "disabled");
  autoOpenSwitch.checked = false;
  otherSwitch.checked = false;
});

// Initialize switches based on localStorage
updateSwitches();

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
