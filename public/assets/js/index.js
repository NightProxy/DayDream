var defWisp =
  (location.protocol === "https:" ? "wss" : "ws") +
  "://" +
  location.host +
  "/wisp/";
var wispUrl = localStorage.getItem("wisp") || defWisp;
var bareUrl = localStorage.getItem("bare") || "/bare/";

const api = new Api(
  localStorage.getItem("search") || "https://www.google.com/search?q=%s",
  localStorage.getItem("transports") || "epoxy",
  wispUrl,
  bareUrl,
  document.getElementById("browser-container"),
);

const proxySetting = localStorage.getItem("proxy") ?? "uv";
const swConfig = {
  uv: { file: "/@/sw.js", config: __uv$config },
};

const { file: swFile, config: swConfigSettings } = swConfig[proxySetting] ?? {
  file: "/@/sw.js",
  config: __uv$config,
};
async function getFavicon() {
  try {
    var googleFaviconUrl = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(url)}`;
    const response = await fetch(googleFaviconUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error fetching favicon as data URL:", error);
    return null;
  }
}
api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
  await api.proxy.setTransports();
  api.browser.createTab("daydream://newtab")
  if (!window.top) {
    if (api.browser.getInternalURL(location.pathname) == "daydream://newtab") {
      let newtabSearchBar = document.getElementById("newTabSearch");

      if (newtabSearchBar) {
        newtabSearchBar.addEventListener("keydown", function (e) {
          if (e.key = "Enter") {
            let newTabSearchVar = api.browser.processUrl(newtabSearchBar.value);
            if (!newTabSearchVar.startsWith("/internal/")) {
              newTabSearchVar = api.proxy.search(this.newTabSearchVar)
              let encodedUrl =
                swConfigSettings.prefix +
                api.proxy.crypts.encode(newTabSearchVar);
              location.href = encodedUrl;
            }
          }
        })
        switch (localStorage.getItem("search")) {
          case 'https://duckduckgo.com/?q=%s':
            document.querySelector('.searchEngineIcon').src =
              '/assets/imgs/b/ddg.webp';
            document.querySelector('.searchEngineIcon').style.transform =
              'scale(1.35)';
            break;
          case 'https://bing.com/search?q=%s':
            document.querySelector('.searchEngineIcon').src =
              '/assets/imgs/b/bing.webp';
            document.querySelector('.searchEngineIcon').style.transform =
              'scale(1.65)';
            break;
          case 'https://www.google.com/search?q=%s':
            document.querySelector('.searchEngineIcon').src =
              '/assets/imgs/b/google.webp';
            document.querySelector('.searchEngineIcon').style.transform =
              'scale(1.2)';
            break;
          case 'https://search.yahoo.com/search?p=%s':
            document.querySelector('.searchEngineIcon').src =
              '/assets/imgs/b/yahoo.webp';
            document.querySelector('.searchEngineIcon').style.transform =
              'scale(1.5)';
            break;
          default:
            getFavicon().then((dataUrl) => {
              if (dataUrl == null) {
                document.querySelector('.searchEngineIcon').src =
                  '/assets/imgs/b/google.webp';
                document.querySelector('.searchEngineIcon').style.transform =
                  'scale(1.2)';
              } else {
                document.querySelector('.searchEngineIcon').src =
                  dataUrl;
                document.querySelector('.searchEngineIcon').style.transform =
                  'scale(1.2)';
              }
            })
        }

      }
    }
  }
});


const uvSearchBar = api.browser.addressBar;

uvSearchBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    console.log("Searching...");
    e.preventDefault();
    if (uvSearchBar.value.startsWith("daydream://")) {
      api.browser.navigate(uvSearchBar.value);
    } else {
      api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
        await api.proxy.setTransports();
        let encodedUrl =
          swConfigSettings.prefix +
          api.proxy.crypts.encode(api.proxy.search(uvSearchBar.value));
        const activeIframe = document.querySelector("iframe.active");
        if (activeIframe) {
          activeIframe.src = encodedUrl;
          setTimeout(() => {
            activeIframe.src = activeIframe.src;
          }, 100);
        }
      });
    }
    uvSearchBar.querySelectorAll('.search-header__icon')[0].style.display = 'none';

    let cleanedUrl = api.proxy.crypts.decode(
      url.split(swConfigSettings.prefix).pop()
    );

    let isSecure = cleanedUrl.startsWith('https://');

    cleanedUrl = cleanedUrl.replace(/^https?:\/\//, '');

    if (cleanedUrl === 'a`owt8bnalk') {
      address2.value = 'Loading...';
    } else if (cleanedUrl.endsWith('/500')) {
      address2.value = 'Internal Server Error! Did you load a broken link?';
    } else {
      address2.value = cleanedUrl;
    }

    let webSecurityIcon = document.querySelector('.webSecurityIcon');
    if (isSecure) {
      webSecurityIcon.id = 'secure';
      webSecurityIcon.innerHTML =
        '<span class="material-icons" style="font-size: 20px !important; height: 16px !important; width: 16px !important; padding: 0 !important; background-color: transparent !important;">lock</span>';
    } else {
      webSecurityIcon.id = 'notSecure';
      webSecurityIcon.innerHTML =
        '<span class="material-icons" style="font-size: 20px !important; height: 16px !important; width: 16px !important; padding: 0 !important; background-color: transparent !important;">lock_open</span>';
    }
  }
});

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "t") {
    console.log("Creating new Tab");
    api.browser.createTab("daydream://newtab");
  } else if (event.altKey && event.key === "w") {
    api.browser.closeCurrentTab()
  }
});

const searchbar = uvSearchBar;

const suggestionList = document.createElement("div");
suggestionList.classList.add("suggestion-list");

searchbar.addEventListener("keydown", async (event) => {
  const query = event.target.value.trim(); // Trim to remove leading and trailing whitespace
  if (query === "") {
    // Clear suggestion list if query is empty
    suggestionList.innerHTML = "";
    return;
  }

  const response = await fetch(`/search=${query}`).then((res) =>
    res.json()
  );
  const suggestions = response.map((item) => item.phrase);

  // Clear previous suggestions
  suggestionList.innerHTML = "";

  // Populate the suggestion list
  suggestions.forEach((suggestion) => {
    const listItem = document.createElement("div");
    listItem.textContent = suggestion;
    listItem.addEventListener("click", () => {
      searchbar.value = suggestion;
      form.dispatchEvent(new Event("submit"));
    });
    suggestionList.appendChild(listItem);
  });
});

// Clear suggestion list when search bar is emptied via backspace
searchbar.addEventListener("keydown", (event) => {
  if (event.key === "Backspace" && searchbar.value === "") {
    suggestionList.innerHTML = "";
  }
});

let selectedSuggestionIndex = -1;

searchbar.addEventListener("keydown", (event) => {
  const suggestionItems = suggestionList.querySelectorAll("div");
  const numSuggestions = suggestionItems.length;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedSuggestionIndex =
      (selectedSuggestionIndex + 1) % numSuggestions;
    updateSelectedSuggestion();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedSuggestionIndex =
      (selectedSuggestionIndex - 1 + numSuggestions) % numSuggestions;
    updateSelectedSuggestion();
  } else if (event.key === "Tab") {
    if (selectedSuggestionIndex !== -1) {
      event.preventDefault();
      const selectedSuggestion =
        suggestionItems[selectedSuggestionIndex].textContent;
      searchbar.value = selectedSuggestion;
    }
  }
});

function updateSelectedSuggestion() {
  const suggestionItems = suggestionList.querySelectorAll("div");
  suggestionItems.forEach((item, index) => {
    if (index === selectedSuggestionIndex) {
      item.classList.add("selected");
    } else {
      item.classList.remove("selected");
    }
  });
}
document.body.appendChild(suggestionList)