const settingsAPI = new SettingsAPI();
const dataExportAPI = new DataExportAPI();
const eventsAPI = new EventSystem();
const globalFunctions = new Global(settingsAPI);
const nightmare = new Nightmare();

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
      `Button text element not found within dropdown button with id "${buttonId}".`
    );
    return;
  }

  const savedValue = (await settingsAPI.getItem(settingsKey)) || defaultValue;
  const selectedOption = dropdownOptions.querySelector(
    `[data-value="${savedValue}"]`
  );
  if (selectedOption) {
    buttonText.textContent = selectedOption.textContent;
  } else {
    console.warn(
      `No option found for value "${savedValue}" in dropdown with id "${optionsId}".`
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
        dropdownOptions.style.display = "none";
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


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/internal/themeing.sw.js");
}

const uploadInput = document.getElementById("bgInput");
const uploadButton = document.getElementById("bgUpload");
const removeButton = document.getElementById("bgRemove");
const bgList = document.getElementById("bgList");
const selectedBgPreview = document.getElementById("bgPreview");

function sendMessageToSW(message) {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error("No active Service Worker to handle the message."));
      return;
    }

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    navigator.serviceWorker.controller.postMessage(message, [
      messageChannel.port2,
    ]);
  });
}

uploadInput.addEventListener("change", () => {
  const file = uploadInput.files[0];
  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  sendMessageToSW({ type: "uploadBG", file }).then(() => {
    alert("Background uploaded successfully.");
    listBackgrounds();
  });
  settingsAPI.setItem(
    "theme:background-image",
    `/internal/themes/backgrounds/${file.name}`
  );
  eventsAPI.emit("theme:background-change");
});

removeButton.addEventListener("click", () => {
  sendMessageToSW({ type: "removeBG" }).then(() => {
    alert("All backgrounds removed.");
    listBackgrounds();
  });
});

async function listBackgrounds() {
  const { filenames } = await sendMessageToSW({ type: "listBG" });
  console.log(filenames);
  bgList.innerHTML = "";
  filenames.forEach((filename) => {
    const listItem = document.createElement("div");
    listItem.className = "bg-list-item";

    const text = document.createElement("span");
    text.textContent = filename;

    const selectButton = document.createElement("button");
    selectButton.textContent = "Select";
    selectButton.addEventListener("click", () => {
      selectedBgPreview.src = `/internal/themes/backgrounds/${filename}`;
      settingsAPI.setItem(
        "theme:background-image",
        `/internal/themes/backgrounds/${filename}`
      );
      eventsAPI.emit("theme:background-change");
    });

    listItem.appendChild(text);
    listItem.appendChild(selectButton);
    bgList.appendChild(listItem);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  //Cloaking
  initializeDropdown("tabCloakButton", "tabCloakOptions", "tabCloak", "off");
  initializeDropdown("URL-cloakButton", "URL-cloakOptions", "URL_Cloak", "off");
  initSwitch(document.getElementById("autoCloakSwitch"), "autoCloak", function() {
    eventsAPI.emit("cloaking:auto-toggle");
  });

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
    function() {
      eventsAPI.emit("theme:template-change");
      setTimeout(() => {
        eventsAPI.emit("theme:template-change");
      }, 100);
    }
  );

  listBackgrounds();
  selectedBgPreview.src =
    (await settingsAPI.getItem("theme:background-image")) ||
    "/assets/imgs/DDX.bg.jpeg";

  // Searching
  initializeDropdown("proxyButton", "proxyOptions", "proxy", "uv");
  initializeDropdown(
    "transportButton",
    "transportOptions",
    "transports",
    "libcurl"
  );
  initializeDropdown(
    "searchButton",
    "searchOptions",
    "search",
    "https://google.com/search?q=%s"
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
  "wisp"
);

document
  .getElementById("resetWispSetting")
  .addEventListener("click", async () => {
    await settingsAPI.removeItem("wisp");
    location.reload();
  });
