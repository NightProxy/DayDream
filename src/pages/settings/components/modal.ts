export interface ModalAction {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "ghost" | "danger";
  closeOnClick?: boolean;
}

export interface ModalOptions {
  title: string;
  description?: string;
  body?: HTMLElement | string;
  primary: ModalAction;
  secondary?: ModalAction;
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}

export function openModal(opts: ModalOptions): ModalHandle {
  const backdrop = document.createElement("div");
  backdrop.className = "settings-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "modal-title";
  title.textContent = opts.title;
  modal.appendChild(title);

  if (opts.description) {
    const d = document.createElement("div");
    d.className = "modal-desc";
    d.textContent = opts.description;
    modal.appendChild(d);
  }

  if (opts.body) {
    const b = document.createElement("div");
    b.className = "modal-body";
    if (typeof opts.body === "string") b.innerHTML = opts.body;
    else b.appendChild(opts.body);
    modal.appendChild(b);
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  }

  function attachAction(a: ModalAction) {
    const b = document.createElement("button");
    b.className = "settings-button" + (a.variant === "ghost" ? " ghost" : a.variant === "danger" ? " danger" : "");
    b.textContent = a.label;
    b.addEventListener("click", async () => {
      try {
        await a.onClick();
      } finally {
        if (a.closeOnClick !== false) close();
      }
    });
    actions.appendChild(b);
  }

  if (opts.secondary) attachAction(opts.secondary);
  attachAction(opts.primary);

  modal.appendChild(actions);
  backdrop.appendChild(modal);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);

  return { close, root: modal };
}
