import { createIcons, icons } from "lucide";
import { settingsSearch } from "./settingsSearch";

export interface SubpageOptions {
  parentLabel: string;       // e.g. "Privacy and security"
  title: string;             // e.g. "Site settings"
  parentSectionId: string;   // which section's hash to return to
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

  // Subpage owns search scope while mounted — scope to parent section id
  // so units registered within this sub-page (with sectionId === parentSectionId)
  // are the only ones the search bar filters against.
  settingsSearch.scope(opts.parentSectionId);

  Promise.resolve(opts.render(body)).then(() => {
    createIcons({ icons });
  });

  return root;
}

export function clearSubpageScope() {
  settingsSearch.scope(null);
}
