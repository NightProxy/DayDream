const settingsAPI = new SettingsAPI();
const dataExportAPI = new DataExportAPI();
const eventsAPI = new EventSystem();
const globalFunctions = new Global(settingsAPI);
const nightmare = new Nightmare();

// ^ imports / constant defintions / class initializations

const initializeDropdown = async (
  buttonId,
  optionsId,
  settingsKey,
  defaultValue,
  functions = null
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/internal/themeing.sw.js");
}

const uploadBGInput = document.getElementById("bgInput");
const uploadBGButton = document.getElementById("bgUpload");
const removeBGButton = document.getElementById("bgRemove");
const bgList = document.getElementById("bgList");
const selectedBgPreview = document.getElementById("bgPreview");
const uploadLogoInput = document.getElementById("logoInput");
const uploadLogoButton = document.getElementById("logoUpload");
const removeLogoButton = document.getElementById("logoRemove");
const logoList = document.getElementById("logoList");
const selectedLogoPreview = document.getElementById("logoPreview");

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

window.sendMessageToSW = sendMessageToSW;

uploadBGInput.addEventListener("change", () => {
  const file = uploadBGInput.files[0];
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

uploadLogoInput.addEventListener("change", () => {
  const file = uploadLogoInput.files[0];
  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  sendMessageToSW({ type: "uploadLogo", file }).then(() => {
    alert("Logo uploaded successfully.");
    listLogos();
  });
  settingsAPI.setItem("theme:logo", `/internal/themes/logos/${file.name}`);
  eventsAPI.emit("theme:logo-change");
});

removeLogoButton.addEventListener("click", async () => {
  sendMessageToSW({
    type: "removeLogo",
    file: (await settingsAPI.getItem("theme:logo")).replace(
      "/internal/themes/logos/",
      ""
    ),
  }).then(() => {
    alert("Logo removed.");
    setTimeout(() => {
      listLogos();
    }, 100);
  });
});

removeBGButton.addEventListener("click", async () => {
  sendMessageToSW({
    type: "removeBG",
    file: (await settingsAPI.getItem("theme:background-image")).replace(
      "/internal/themes/backgrounds/",
      ""
    ),
  }).then(() => {
    alert("All backgrounds removed.");
    setTimeout(() => {
      listBackgrounds();
    }, 100);
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

async function listLogos() {
  const { logoFilenames } = await sendMessageToSW({ type: "listLogos" });
  console.log(logoFilenames);
  logoList.innerHTML = "";
  logoFilenames.forEach((filename) => {
    const listItem = document.createElement("div");
    listItem.className = "bg-list-item";

    const text = document.createElement("span");
    text.textContent = filename;

    const selectButton = document.createElement("button");
    selectButton.textContent = "Select";
    selectButton.addEventListener("click", () => {
      selectedBgPreview.src = `/internal/themes/logos/${filename}`;
      settingsAPI.setItem("theme:logo", `/internal/themes/logos/${filename}`);
      eventsAPI.emit("theme:logo-change");
    });

    listItem.appendChild(text);
    listItem.appendChild(selectButton);
    logoList.appendChild(listItem);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  //Cloaking
  initializeDropdown("tabCloakButton", "tabCloakOptions", "tabCloak", "off");
  initializeDropdown("URL-cloakButton", "URL-cloakOptions", "URL_Cloak", "off");
  initSwitch(
    document.getElementById("autoCloakSwitch"),
    "autoCloak",
    function () {
      eventsAPI.emit("cloaking:auto-toggle");
    }
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
    }
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
    }
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
    }
  );

  listBackgrounds();
  listLogos();
  selectedBgPreview.src =
    (await settingsAPI.getItem("theme:background-image")) ||
    "/assets/imgs/DDX.bg.jpeg";
  selectedLogoPreview.src =
    (await settingsAPI.getItem("theme:logo")) || "/assets/imgs/logo.png";

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
    "https://duckduckgo.com/?q=%s"
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
