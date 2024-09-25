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

api.proxy.registerSW(swFile, swConfigSettings).then(async () => {
  await api.proxy.setTransports();
  api.browser.createTab("daydream://newtab");
});

async function getFavicon(url) {
  try {
    var googleFaviconUrl = `/internal/icons/https://icons.duckduckgo.com/ip3/${url}.ico`;
    return googleFaviconUrl;
  } catch (error) {
    console.error("Error fetching favicon as data URL:", error);
    return null;
  }
}


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


async function generatePredictedUrls(query) {
  try {
    const response = await fetch(`/search=${query}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data.map((item) => item.phrase); // Assuming 'phrase' is the property you're interested in
  } catch (error) {
    console.error("Error fetching predicted URLs:", error);
    return []; // Return an empty array on error
  }
}

const suggestionList = document.createElement("div");
suggestionList.classList.add("suggestion-list");

const createSection = (titleText) => {
  const section = document.createElement("div");
  section.classList.add("search-section");

  const searchTitle = document.createElement("div");
  searchTitle.classList.add("search-title");

  const icon = document.createElement("img");
  icon.classList.add("searchEngineIcon");
  icon.src = '/assets/imgs/logo.png';

  const title = document.createElement("span");
  title.textContent = titleText;

  searchTitle.appendChild(icon);
  searchTitle.appendChild(title);

  const searchResults = document.createElement("div");
  searchResults.classList.add("search-results");

  section.appendChild(searchTitle);
  section.appendChild(searchResults);

  return { section, searchResults };
}

// Define the four sections
const sections = {
  searchResults: createSection("Search Results"),
  otherPages: createSection("Other Pages"),
  settings: createSection("Settings"),
  games: createSection("Games")
};

// Append the sections to the suggestion list
Object.values(sections).forEach(({ section }) => suggestionList.appendChild(section));

const maxInitialResults = 4;
const maxExpandedResults = 8;
let currentSectionIndex = 0;

let appsData = []; // Global variable for storing game data

searchbar.addEventListener("input", async (event) => {
  suggestionList.style.display = "flex";
  const query = event.target.value.trim();
  if (query === "") {
    clearSuggestions();
    return;
  }

  let cleanedQuery = query.replace(/^(daydream:\/\/|daydream:\/|daydream:)/, "");
  const response = await fetch(`/search=${cleanedQuery}`).then((res) => res.json());
  const suggestions = response.map((item) => item.phrase);

  clearSuggestions();

  // Populate the suggestion list with the sections based on query
  await populateSections(suggestions);
});

function clearSuggestions() {
  Object.values(sections).forEach(({ searchResults }) => {
    searchResults.innerHTML = "";
    searchResults.parentElement.style.display = "none";
  });
}

async function populateSections(suggestions) {
  // Populate Search Results
  const searchResultsSuggestions = suggestions.slice(0, maxExpandedResults);
  populateSearchResults(searchResultsSuggestions);

  // Populate Other Pages
  await populateOtherPages(suggestions);

  // Populate Settings
  await populateSettings(suggestions);

  // Populate Games
  await populateGames(suggestions);
}

// Populate Search Results
function populateSearchResults(suggestions) {
  const { searchResults, section } = sections.searchResults;
  if (suggestions.length > 0) {
    section.style.display = "block";
    suggestions.forEach((suggestion) => {
      const listItem = createSuggestionItem(suggestion);
      searchResults.appendChild(listItem);
    });
  }
}

// Predict possible internal URLs and check their existence for "Other Pages"
async function populateOtherPages(query) {
  const { searchResults, section } = sections.otherPages;
  let hasResults = false;

  console.log("Query:", query);
  for (let url of query) {
    url = url.replace(/ /g, '');
    url = "daydream://" + url;
    const internalUrl = api.browser.processUrl(url);
    const response = await fetch(internalUrl, { method: 'HEAD' });

    if (response.ok) {
      const listItem = createSuggestionItem(url);
      searchResults.appendChild(listItem);
      hasResults = true;
    }
  }
  section.style.display = hasResults ? "block" : "none";
}

// Predict possible internal URLs and check their existence for "Settings"
async function populateSettings() {
  const { searchResults, section } = sections.settings;
  let hasResults = false;

  let query = searchbar.value.trim();
  query = query.replace(/^(daydream:\/\/|daydream:\/|daydream:)/, "");

  // Generate possible settings URLs based on the query
  const predictedUrls = generatePredictedSettingsUrls(query);
  for (let url of predictedUrls) {
    const response = await fetch(url, { method: 'HEAD' });

    if (response.ok) { // Only include if the page exists
      const listItem = createSuggestionItem(url);
      searchResults.appendChild(listItem);
      hasResults = true;
    }
  }

  section.style.display = hasResults ? "block" : "none";
}

// Generate potential URLs for settings pages dynamically
function generatePredictedSettingsUrls(query) {
  const basePaths = [
    "settings", "settings/about", "settings/profile", "settings/privacy", "settings/security", "settings/notifications"
  ];
  query = query.replace(/ /g, '');
  return basePaths.map(base => `${base}${query ? `/${query}` : ''}`);
}

// Populate Games section based on the query
async function populateGames(query) {
  const { searchResults, section } = sections.games;
  let hasResults = false;

  // Fetch game data from JSON file if not already loaded
  if (appsData.length === 0) {
    await fetchAppData();
  }

  // Filter games based on the query, ignoring case sensitivity
  const filteredGames = appsData.filter((app) =>
    app.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10); // Show up to 10 results

  if (filteredGames.length > 0) {
    section.style.display = "block";
    filteredGames.forEach((game) => {
      const listItem = createGameItem(game);
      searchResults.appendChild(listItem);
      hasResults = true;
    });
  }

  section.style.display = hasResults ? "block" : "none";
}

// Function to fetch JSON data from the file
async function fetchAppData() {
  try {
    const response = await fetch("/assets/json/a.json");
    appsData = await response.json(); // Assign appsData to the global variable
  } catch (error) {
    console.error("Error fetching JSON data:", error);
  }
}

function createSuggestionItem(suggestion) {
  const listItem = document.createElement("div");
  const listIcon = document.createElement("span");
  listIcon.classList.add("material-symbols-outlined");
  listIcon.textContent = "search";
  listItem.appendChild(listIcon);
  listItem.innerHTML += suggestion;
  listItem.addEventListener("click", () => {
    searchbar.value = suggestion;
    api.browser.navigate(swConfigSettings.prefix + api.proxy.crypts.encode(api.proxy.search(suggestion)));
    clearSuggestions();
    suggestionList.style.display = "none";
  });
  return listItem;
}

// Create game item with the game icon instead of material icon
function createGameItem(game) {
  const listItem = document.createElement("div");
  listItem.classList.add("game-item");

  const listIcon = document.createElement("img");
  listIcon.classList.add("game-icon");
  listIcon.src = game.image; // Use game icon from JSON data
  listItem.appendChild(listIcon);

  const gameName = document.createElement("span");
  gameName.textContent = game.name;
  listItem.appendChild(gameName);

  listItem.addEventListener("click", () => {
    searchbar.value = game.name;
    api.browser.navigate(api.proxy.search(game.link));
  });

  return listItem;
}

let selectedSuggestionIndex = -1;
let currentMaxResults = maxInitialResults;

searchbar.addEventListener("keydown", (event) => {
  const suggestionItems = getCurrentSuggestionItems();
  const numSuggestions = suggestionItems.length;
  suggestionList.style.display = "flex";

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (selectedSuggestionIndex + 1 >= currentMaxResults) {
      currentMaxResults = Math.min(numSuggestions, maxExpandedResults);
    } else {
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % numSuggestions;
    }
    updateSelectedSuggestion();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + numSuggestions) % numSuggestions;
    updateSelectedSuggestion();
  } else if (event.key === "Tab") {
    if (selectedSuggestionIndex !== -1) {
      event.preventDefault();
      const selectedSuggestion = suggestionItems[selectedSuggestionIndex].textContent;
      searchbar.value = selectedSuggestion;
    }
  } else if (event.key === "ArrowRight") {
    if (selectedSuggestionIndex !== -1) {
      event.preventDefault();
      const selectedSuggestion = suggestionItems[selectedSuggestionIndex].textContent;
      searchbar.value = selectedSuggestion;
    }
  } else if (event.key === "ArrowLeft") {
    if (currentMaxResults === maxExpandedResults) {
      event.preventDefault();
      moveToNextSection();
    }
  } else if (event.key === "Backspace" && searchbar.value === "") {
    clearSuggestions();
    suggestionList.style.display = "none";
  }


  suggestionList.querySelectorAll(".searchEngineIcon")[0].style.display = 'block';
  switch (localStorage.getItem("search")) {
    case 'https://duckduckgo.com/?q=%s':
      suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
        '/assets/imgs/b/ddg.webp';
      suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
        'scale(1.35)';
      break;
    case 'https://bing.com/search?q=%s':
      suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
        '/assets/imgs/b/bing.webp';
      suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
        'scale(1.65)';
      break;
    case 'https://www.google.com/search?q=%s':
      suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
        '/assets/imgs/b/google.webp';
      suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
        'scale(1.2)';
      break;
    case 'https://search.yahoo.com/search?p=%s':
      suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
        '/assets/imgs/b/yahoo.webp';
      suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
        'scale(1.5)';
      break;
    default:
      getFavicon(localStorage.getItem("search")).then((dataUrl) => {
        if (dataUrl == null || dataUrl.endsWith("null")) {
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            '/assets/imgs/b/google.webp';
          suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
            'scale(1.2)';
        } else {
          suggestionList.querySelectorAll(".searchEngineIcon")[0].src =
            dataUrl;
          suggestionList.querySelectorAll(".searchEngineIcon")[0].style.transform =
            'scale(1.2)';
        }
      })
  }
});
function moveToNextSection() {
  currentSectionIndex = (currentSectionIndex + 1) % Object.values(sections).length;
  while (Object.values(sections)[currentSectionIndex].searchResults.children.length === 0) {
    currentSectionIndex = (currentSectionIndex + 1) % Object.values(sections).length;
  }
  selectedSuggestionIndex = -1;
  currentMaxResults = maxInitialResults;
  updateSelectedSuggestion();
}

function getCurrentSuggestionItems() {
  return Object.values(sections)[currentSectionIndex].searchResults.querySelectorAll("div");
}

function updateSelectedSuggestion() {
  const suggestionItems = getCurrentSuggestionItems();
  suggestionItems.forEach((item, index) => {
    if (index === selectedSuggestionIndex) {
      item.classList.add("selected");
    } else {
      item.classList.remove("selected");
    }
  });
}

document.body.appendChild(suggestionList);
