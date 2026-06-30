import { createIcons, icons } from "lucide";
import { settingsSearch } from "./settingsSearch";

export interface SubpageOptions {
  parentLabel: string;
  title: string;
  parentSectionId: string;
  render: (container: HTMLElement) => void | Promise<void>;
}

export function createSubpage(opts: SubpageOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "settings-subpage";
  root.dataset.subpage = "true";

  const header = document.createElement("div");
  header.className = "settings-subpage-header";

  const back = document.createElement("button");
  back.className = "subpage-back";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = '<i data-lucide="arrow-left"></i>';
  back.addEventListener("click", () => {
    location.hash = `#${opts.parentSectionId}`;
  });
  header.appendChild(back);

  const crumb = document.createElement("div");
  crumb.className = "subpage-breadcrumb";
  crumb.innerHTML = `${opts.parentLabel} <span style="opacity:0.4"> › </span> <span class="here">${opts.title}</span>`;
  header.appendChild(crumb);

  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "settings-subpage-body";
  root.appendChild(body);

  settingsSearch.scope(opts.parentSectionId);

  Promise.resolve(opts.render(body)).then(() => {
    createIcons({ icons });
  });

  return root;
}

export function clearSubpageScope() {
  settingsSearch.scope(null);
}
