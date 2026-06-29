import { createIcons, icons } from "lucide";
import { settingsSearch, type SearchUnit } from "./settingsSearch";

export interface RowOptions {
  icon?: string;
  label: string;
  description?: string;
  right?:
    | { kind: "chevron" }
    | { kind: "pill"; text: string; muted?: boolean }
    | { kind: "button"; text: string; onClick: () => void; variant?: "primary" | "ghost" | "danger" }
    | { kind: "custom"; element: HTMLElement }
    | { kind: "none" };
  onClick?: () => void;
  noHover?: boolean;
  searchUnit?: Omit<SearchUnit, "element">;
}

export function createRow(opts: RowOptions): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";
  if (opts.noHover) row.classList.add("no-hover");

  if (opts.icon) {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", opts.icon);
    icon.className = "row-icon";
    row.appendChild(icon);
  }

  const stack = document.createElement("div");
  stack.className = "row-stack";
  const label = document.createElement("div");
  label.className = "row-label";
  label.textContent = opts.label;
  stack.appendChild(label);
  if (opts.description) {
    const sub = document.createElement("div");
    sub.className = "row-sub";
    sub.textContent = opts.description;
    stack.appendChild(sub);
  }
  row.appendChild(stack);

  if (opts.right && opts.right.kind !== "none") {
    const right = document.createElement("div");
    right.className = "row-right";
    switch (opts.right.kind) {
      case "chevron": {
        const c = document.createElement("i");
        c.setAttribute("data-lucide", "chevron-right");
        c.className = "row-chevron";
        right.appendChild(c);
        break;
      }
      case "pill": {
        const p = document.createElement("span");
        p.className = "row-pill" + (opts.right.muted ? " muted" : "");
        p.textContent = opts.right.text;
        right.appendChild(p);
        break;
      }
      case "button": {
        const b = document.createElement("button");
        b.className = "settings-button" + (opts.right.variant === "ghost" ? " ghost" : opts.right.variant === "danger" ? " danger" : "");
        b.textContent = opts.right.text;
        const onBtn = opts.right.onClick;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          onBtn();
        });
        right.appendChild(b);
        break;
      }
      case "custom": {
        right.appendChild(opts.right.element);
        break;
      }
    }
    row.appendChild(right);
  }

  if (opts.onClick) {
    row.addEventListener("click", opts.onClick);
  }

  // Defer icon init until next tick so callers can batch
  queueMicrotask(() => createIcons({ icons }));

  if (opts.searchUnit) {
    settingsSearch.register({ ...opts.searchUnit, element: row });
  }

  return row;
}
