export interface NoticeOptions {
  kind?: "info" | "error";
  timeoutMs?: number;
}

export function showInlineNotice(message: string, opts: NoticeOptions = {}): void {
  const root = (window.d ?? document) as Document | ShadowRoot;
  const container = root.querySelector(".settings-content");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `ddx-inline-notice is-${opts.kind ?? "info"}`;
  el.textContent = message;
  container.prepend(el);
  setTimeout(() => el.remove(), opts.timeoutMs ?? 4000);
}
