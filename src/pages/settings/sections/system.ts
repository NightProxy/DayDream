import { createRow } from "../components/row";
import { createSubpage } from "../components/subpage";
import { createToggle } from "../components/toggle";
import { openInNewTab } from "../data/host";
import type { SectionContext } from "./types";

export async function render(container: HTMLElement, ctx: SectionContext): Promise<void> {
  container.innerHTML = "";
  if (ctx.subpage === "keyboard-shortcuts") return renderKeybinds(container);
  return renderMain(container);
}

async function renderMain(container: HTMLElement): Promise<void> {
  const section = document.createElement("div");
  section.className = "settings-section";
  section.dataset.sectionId = "system";

  const h2 = document.createElement("h2");
  h2.className = "settings-section-title";
  h2.textContent = "System";
  section.appendChild(h2);

  section.appendChild(
    createRow({
      icon: "code",
      label: "DevTools",
      description: "chii DevTools is always enabled. Press Ctrl+Shift+I to open.",
      right: { kind: "pill", text: "Always on" },
      noHover: true,
      searchUnit: {
        id: "system/devtools",
        label: "DevTools",
        sectionId: "system",
        keywords: ["chii", "debug", "inspector"],
      },
    }),
  );

  section.appendChild(
    createRow({
      icon: "keyboard",
      label: "Keyboard shortcuts",
      description: "Customize keybinds for browser commands.",
      right: { kind: "chevron" },
      onClick: () => {
        location.hash = "#system?subpage=keyboard-shortcuts";
      },
      searchUnit: {
        id: "system/keybinds",
        label: "Keyboard shortcuts",
        sectionId: "system",
      },
    }),
  );

  section.appendChild(
    createToggle({
      icon: "cpu",
      label: "Hardware acceleration",
      description: "Use the GPU for rendering when available. (Not yet wired to runtime.)",
      settingKey: "hwAccel",
      defaultValue: true,
      searchUnit: {
        id: "system/hwaccel",
        label: "Hardware acceleration",
        sectionId: "system",
      },
    }).element,
  );

  container.appendChild(section);
}

function renderKeybinds(container: HTMLElement): void {
  container.innerHTML = "";
  const sub = createSubpage({
    parentLabel: "System",
    title: "Keyboard shortcuts",
    parentSectionId: "system",
    render: async (body) => {
      body.innerHTML = `
        <div id="keybinds-container"></div>
        <input type="search" id="commands-filter" class="modal-input" placeholder="Filter commands" style="margin:16px 0" />
        <div id="commands-list"></div>
        <button id="reset-all-keybinds" class="settings-button ghost" style="margin-top:16px">Reset all keybinds</button>
      `;
      let initialized = false;
      try {
        const mod = await import("../../settingsOld/index");
        const m = mod as any;
        if (typeof m.initializeKeybindsUI === "function") {
          await m.initializeKeybindsUI();
          initialized = true;
        }
        if (typeof m.initializeCommandsPanel === "function") {
          await m.initializeCommandsPanel();
        }
      } catch (e) {
        console.warn("[system] keybinds init failed:", e);
      }
      if (!initialized) {
        body.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "ddx-host-unavailable";
        const title = document.createElement("div");
        title.className = "ddx-host-unavailable-title";
        title.textContent = "Keybinds editor unavailable";
        wrap.appendChild(title);
        const detail = document.createElement("div");
        detail.className = "ddx-host-unavailable-detail";
        detail.appendChild(document.createTextNode("Open "));
        const link = document.createElement("a");
        link.href = "ddx://settingsOld/#Keybinds";
        link.textContent = "the legacy settings page";
        link.style.color = "var(--main)";
        link.addEventListener("click", (e) => {
          e.preventDefault();
          void openInNewTab("ddx://settingsOld/#Keybinds");
        });
        detail.appendChild(link);
        detail.appendChild(document.createTextNode(" as a fallback."));
        wrap.appendChild(detail);
        body.appendChild(wrap);
      }
    },
  });
  container.appendChild(sub);
}
