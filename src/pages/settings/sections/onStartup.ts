import { SettingsAPI } from "@apis/settings";
import { settingsSearch } from "../components/settingsSearch";

const STORAGE_KEY = "startupBehavior";
const URL_KEY = "startupCustomUrl";

type Mode = "newtab" | "restore" | "custom";

async function getStored(): Promise<{ mode: Mode; url: string }> {
  try {
    const api = new SettingsAPI();
    const mode = (await api.getItem<Mode>(STORAGE_KEY)) ?? "newtab";
    const url = (await api.getItem<string>(URL_KEY)) ?? "";
    return { mode, url };
  } catch {
    return {
      mode: (localStorage.getItem(STORAGE_KEY) as Mode) ?? "newtab",
      url: localStorage.getItem(URL_KEY) ?? "",
    };
  }
}

async function setStored(mode: Mode, url: string): Promise<void> {
  try {
    const api = new SettingsAPI();
    await api.setItem(STORAGE_KEY, mode);
    await api.setItem(URL_KEY, url);
  } catch {
    localStorage.setItem(STORAGE_KEY, mode);
    localStorage.setItem(URL_KEY, url);
  }
}

export async function render(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  const section = document.createElement("div");
  section.className = "settings-section";
  section.dataset.sectionId = "on-startup";

  const h2 = document.createElement("h2");
  h2.className = "settings-section-title";
  h2.textContent = "On startup";
  section.appendChild(h2);

  const { mode, url } = await getStored();
  let current: Mode = mode;
  let currentUrl: string = url;

  const group = document.createElement("div");
  group.className = "settings-radio-group";

  const options: Array<{ value: Mode; label: string; keywords?: string[] }> = [
    { value: "newtab", label: "Open the new tab page", keywords: ["newtab", "startup", "launch"] },
    { value: "restore", label: "Continue where you left off", keywords: ["restore", "session", "reopen"] },
    { value: "custom", label: "Open a specific page or set of pages", keywords: ["custom", "url", "homepage"] },
  ];

  const rows: HTMLElement[] = [];
  let customWrap: HTMLDivElement | undefined;
  let customInput: HTMLInputElement | undefined;

  for (const opt of options) {
    const row = document.createElement("label");
    row.className = "settings-radio-row";
    if (opt.value === current) row.classList.add("selected");

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "startup-mode";
    input.value = opt.value;
    input.checked = opt.value === current;

    input.addEventListener("change", () => {
      if (!input.checked) return;
      current = opt.value;
      for (const r of rows) r.classList.toggle("selected", r === row);
      void setStored(current, currentUrl);
      if (customWrap) customWrap.style.display = current === "custom" ? "block" : "none";
    });

    row.appendChild(input);

    const stack = document.createElement("div");
    stack.className = "radio-stack";
    const label = document.createElement("div");
    label.className = "radio-label";
    label.textContent = opt.label;
    stack.appendChild(label);
    row.appendChild(stack);

    settingsSearch.register({
      id: `on-startup/${opt.value}`,
      label: opt.label,
      sectionId: "on-startup",
      keywords: opt.keywords,
      element: row,
    });

    rows.push(row);
    group.appendChild(row);
  }

  customWrap = document.createElement("div");
  customWrap.className = "startup-custom-input";
  customWrap.style.display = current === "custom" ? "block" : "none";

  customInput = document.createElement("input");
  customInput.type = "url";
  customInput.placeholder = "https://example.com";
  customInput.value = currentUrl;
  customInput.addEventListener("input", () => {
    currentUrl = customInput!.value;
    void setStored(current, currentUrl);
  });
  customWrap.appendChild(customInput);

  group.appendChild(customWrap);

  section.appendChild(group);
  container.appendChild(section);
}
