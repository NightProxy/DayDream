import type { SearchUnit } from "./settingsSearch";
import { settingsSearch } from "./settingsSearch";
import { getSettingsAPI } from "../data/host";
import { showInlineNotice } from "./notice";

export interface ToggleOptions {
  id?: string;
  label: string;
  description?: string;
  icon?: string;
  settingKey?: string;
  defaultValue?: boolean;
  readMap?: (raw: unknown) => boolean | undefined;
  writeMap?: (value: boolean) => unknown;
  onChange?: (value: boolean) => void | Promise<void>;
  /** Search registration. Element is auto-filled to the toggle row by createToggle. */
  searchUnit?: Omit<SearchUnit, "element">;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ToggleHandle {
  element: HTMLElement;
  input: HTMLInputElement;
  getValue(): boolean;
  setValue(value: boolean): void;
  disable(reason?: string): void;
  enable(): void;
  destroy(): void;
}

const defaultRead = (raw: unknown): boolean | undefined => {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  return undefined;
};

export function createToggle(opts: ToggleOptions): ToggleHandle {
  // Reuses existing .settings-row layout (matches createRow visually)
  const row = document.createElement("div");
  row.className = "settings-row no-hover";
  if (opts.id) row.id = opts.id;

  if (opts.icon) {
    const i = document.createElement("i");
    i.setAttribute("data-lucide", opts.icon);
    i.className = "row-icon";
    row.appendChild(i);
  }

  const stack = document.createElement("div");
  stack.className = "row-stack";
  const labelEl = document.createElement("div");
  labelEl.className = "row-label";
  labelEl.textContent = opts.label;
  stack.appendChild(labelEl);
  if (opts.description) {
    const descEl = document.createElement("div");
    descEl.className = "row-sub";
    descEl.textContent = opts.description;
    stack.appendChild(descEl);
  }
  row.appendChild(stack);

  const right = document.createElement("div");
  right.className = "row-right";
  const switchLabel = document.createElement("label");
  switchLabel.className = "ddx-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("data-component", "switch");
  input.className = "sr-only";
  if (opts.id) input.id = `${opts.id}-input`;
  switchLabel.appendChild(input);
  const track = document.createElement("span");
  track.className = "ddx-switch-track";
  switchLabel.appendChild(track);
  right.appendChild(switchLabel);
  row.appendChild(right);

  // Initial load
  const reader = opts.readMap ?? defaultRead;
  const writer = opts.writeMap ?? ((v) => v);
  const defaultValue = opts.defaultValue ?? false;

  let value = defaultValue;
  if (opts.settingKey) {
    // Disable input during initial load so a user click can't race with
    // the async getItem and get clobbered when the stored value resolves.
    // Don't touch the disabled state if opts.disabled is already set —
    // that's a caller-owned condition and gets restored by enable() later.
    const appliedLoadDisable = !opts.disabled;
    if (appliedLoadDisable) {
      input.disabled = true;
      switchLabel.classList.add("is-disabled");
    }
    void (async () => {
      try {
        const api = getSettingsAPI();
        const raw = await api.getItem(opts.settingKey!);
        const coerced = reader(raw);
        value = coerced ?? defaultValue;
        input.checked = value;
      } catch (err) {
        console.warn(`[toggle] load ${opts.settingKey} failed`, err);
      } finally {
        if (appliedLoadDisable) {
          input.disabled = false;
          switchLabel.classList.remove("is-disabled");
        }
      }
    })();
  } else {
    input.checked = defaultValue;
  }

  input.addEventListener("change", async () => {
    const prev = value;
    value = input.checked;
    if (opts.settingKey) {
      try {
        const api = getSettingsAPI();
        await api.setItem(opts.settingKey, writer(value));
      } catch (err) {
        // Persistence failed — revert UI to previous state so the on-screen
        // toggle reflects what is actually on disk, and surface the error.
        console.warn(`[toggle] write ${opts.settingKey} failed`, err);
        value = prev;
        input.checked = prev;
        showInlineNotice(
          `Failed to save "${opts.label}". Your change was not persisted.`,
          { kind: "error" },
        );
        return;
      }
    }
    if (opts.onChange) {
      try {
        await opts.onChange(value);
      } catch (err) {
        console.warn("[toggle] onChange threw", err);
        showInlineNotice(
          `"${opts.label}" change handler failed: ${err instanceof Error ? err.message : String(err)}`,
          { kind: "error" },
        );
      }
    }
  });

  if (opts.disabled) {
    switchLabel.classList.add("is-disabled");
    input.disabled = true;
    if (opts.disabledReason) row.title = opts.disabledReason;
  }

  if (opts.searchUnit) {
    settingsSearch.register({ ...opts.searchUnit, element: row });
  }

  return {
    element: row,
    input,
    getValue: () => value,
    setValue: (v: boolean) => { value = v; input.checked = v; },
    disable: (reason?: string) => {
      switchLabel.classList.add("is-disabled");
      input.disabled = true;
      if (reason) row.title = reason;
    },
    enable: () => {
      switchLabel.classList.remove("is-disabled");
      input.disabled = false;
      row.removeAttribute("title");
    },
    destroy: () => { row.remove(); },
  };
}
