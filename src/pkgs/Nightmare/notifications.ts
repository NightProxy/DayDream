// src/pkgs/Nightmare/notifications.ts
//
// Toast-style notification manager. Renders stacked toasts in the
// bottom-right corner. Used by chrome.notifications.* via the Helium
// host bridge but also usable directly via `ui.notifications.show(...)`.
//
// Supports basic / image / list / progress types. Auto-dismiss after
// 5s unless requireInteraction is set. Buttons fire onButtonClick.

export type NotificationType = 'basic' | 'image' | 'list' | 'progress';

export interface NotificationItem {
  title: string;
  message: string;
}

export interface NotificationButton {
  title: string;
  iconUrl?: string;
}

export interface NotificationOptions {
  type?: NotificationType;
  iconUrl?: string;
  title: string;
  message: string;
  contextMessage?: string;
  priority?: number;
  eventTime?: number;
  buttons?: NotificationButton[];
  imageUrl?: string;
  items?: NotificationItem[];
  progress?: number;
  requireInteraction?: boolean;
  silent?: boolean;
}

export interface NotificationCallbacks {
  onClicked?: () => void;
  onClosed?: (byUser: boolean) => void;
  onButtonClicked?: (buttonIndex: number) => void;
}

interface ActiveNotification {
  id: string;
  options: NotificationOptions;
  callbacks: NotificationCallbacks;
  element: HTMLElement;
  autoDismissTimer: number | null;
}

const STYLE_ID = '__nightmare_notifications_style__';
const CONTAINER_ID = '__nightmare_notifications_container__';
const AUTO_DISMISS_MS = 5000;

const STYLES = `
#${CONTAINER_ID} {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  pointer-events: none;
  max-width: 380px;
}
.nm-notification {
  pointer-events: auto;
  background: rgba(28, 28, 32, 0.95);
  color: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.06);
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: start;
  animation: nmSlideIn 220ms ease-out;
}
@keyframes nmSlideIn {
  from { transform: translateX(120%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
.nm-notification.nm-leaving {
  animation: nmSlideOut 180ms ease-in forwards;
}
@keyframes nmSlideOut {
  to { transform: translateX(120%); opacity: 0; }
}
.nm-notification-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  background: rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.nm-notification-body { min-width: 0; }
.nm-notification-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nm-notification-message {
  color: rgba(255,255,255,0.85);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.nm-notification-context {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255,255,255,0.55);
}
.nm-notification-list {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: 12px;
  color: rgba(255,255,255,0.8);
}
.nm-notification-progress {
  width: 100%;
  height: 4px;
  margin-top: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
.nm-notification-progress > span {
  display: block;
  height: 100%;
  background: #4ea1ff;
  transition: width 200ms ease-out;
}
.nm-notification-image {
  margin-top: 6px;
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 6px;
}
.nm-notification-buttons {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.nm-notification-buttons button {
  flex: 1;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
}
.nm-notification-buttons button:hover { background: rgba(255,255,255,0.14); }
.nm-notification-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.65);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  margin: -2px -4px 0 0;
}
.nm-notification-close:hover { color: #fff; }
`;

let nextId = 0;

export class NotificationManager {
  private active = new Map<string, ActiveNotification>();
  private container: HTMLElement | null = null;
  // NightmareUI ref retained for future API consistency (parity with
  // other Nightmare components which receive `ui` in their constructor).
  // Currently unused inside the manager.
  constructor(_ui?: unknown) {
    void _ui;
  }

  show(opts: NotificationOptions, callbacks: NotificationCallbacks = {}, idHint?: string): string {
    this.ensureStyles();
    const container = this.ensureContainer();
    const id = idHint ?? `notif-${++nextId}`;
    // If id already exists, treat as update.
    const existing = this.active.get(id);
    if (existing) {
      this.applyToElement(existing.element, opts);
      existing.options = { ...existing.options, ...opts };
      existing.callbacks = { ...existing.callbacks, ...callbacks };
      this.resetAutoDismiss(existing);
      return id;
    }
    const element = this.buildElement(id, opts, callbacks);
    container.appendChild(element);
    const item: ActiveNotification = {
      id,
      options: opts,
      callbacks,
      element,
      autoDismissTimer: null,
    };
    this.active.set(id, item);
    this.resetAutoDismiss(item);
    return id;
  }

  update(id: string, opts: Partial<NotificationOptions>): boolean {
    const item = this.active.get(id);
    if (!item) return false;
    const merged: NotificationOptions = { ...item.options, ...opts };
    item.options = merged;
    this.applyToElement(item.element, merged);
    this.resetAutoDismiss(item);
    return true;
  }

  clear(id: string, byUser = false): boolean {
    const item = this.active.get(id);
    if (!item) return false;
    if (item.autoDismissTimer !== null) clearTimeout(item.autoDismissTimer);
    item.element.classList.add('nm-leaving');
    setTimeout(() => {
      item.element.remove();
    }, 200);
    this.active.delete(id);
    try { item.callbacks.onClosed?.(byUser); } catch (err) { console.error(err); }
    return true;
  }

  list(): string[] {
    return Array.from(this.active.keys());
  }

  getPermissionLevel(): 'granted' | 'denied' {
    // No native browser permission required — DDX shell renders these
    // directly. Always granted.
    return 'granted';
  }

  // ── internals ──────────────────────────────────────────────────

  private ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  private ensureContainer(): HTMLElement {
    if (this.container && document.body.contains(this.container)) return this.container;
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CONTAINER_ID;
      document.body.appendChild(el);
    }
    this.container = el;
    return el;
  }

  private buildElement(
    id: string,
    opts: NotificationOptions,
    callbacks: NotificationCallbacks,
  ): HTMLElement {
    const root = document.createElement('div');
    root.className = 'nm-notification';
    root.dataset['notificationId'] = id;

    const icon = document.createElement('img');
    icon.className = 'nm-notification-icon';
    if (opts.iconUrl) icon.src = opts.iconUrl;
    root.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'nm-notification-body';
    body.appendChild(this.makeTitleEl(opts.title));
    body.appendChild(this.makeMessageEl(opts.message));
    if (opts.contextMessage) {
      const ctx = document.createElement('div');
      ctx.className = 'nm-notification-context';
      ctx.textContent = opts.contextMessage;
      body.appendChild(ctx);
    }
    const type = opts.type ?? 'basic';
    if (type === 'list' && opts.items) {
      const ul = document.createElement('ul');
      ul.className = 'nm-notification-list';
      for (const it of opts.items) {
        const li = document.createElement('li');
        li.textContent = `${it.title}: ${it.message}`;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    } else if (type === 'progress') {
      const wrap = document.createElement('div');
      wrap.className = 'nm-notification-progress';
      const bar = document.createElement('span');
      bar.style.width = `${Math.max(0, Math.min(100, opts.progress ?? 0))}%`;
      wrap.appendChild(bar);
      body.appendChild(wrap);
    } else if (type === 'image' && opts.imageUrl) {
      const img = document.createElement('img');
      img.className = 'nm-notification-image';
      img.src = opts.imageUrl;
      body.appendChild(img);
    }
    root.appendChild(body);

    const close = document.createElement('button');
    close.className = 'nm-notification-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00D7';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear(id, true);
    });
    root.appendChild(close);

    if (opts.buttons && opts.buttons.length > 0) {
      const btns = document.createElement('div');
      btns.className = 'nm-notification-buttons';
      opts.buttons.forEach((b, idx) => {
        const btn = document.createElement('button');
        btn.textContent = b.title;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          try { callbacks.onButtonClicked?.(idx); } catch (err) { console.error(err); }
        });
        btns.appendChild(btn);
      });
      root.appendChild(btns);
    }

    root.addEventListener('click', () => {
      try { callbacks.onClicked?.(); } catch (err) { console.error(err); }
    });

    return root;
  }

  private makeTitleEl(text: string): HTMLElement {
    const t = document.createElement('div');
    t.className = 'nm-notification-title';
    t.textContent = text;
    return t;
  }

  private makeMessageEl(text: string): HTMLElement {
    const m = document.createElement('div');
    m.className = 'nm-notification-message';
    m.textContent = text;
    return m;
  }

  private applyToElement(element: HTMLElement, opts: NotificationOptions): void {
    const title = element.querySelector('.nm-notification-title') as HTMLElement | null;
    if (title) title.textContent = opts.title;
    const msg = element.querySelector('.nm-notification-message') as HTMLElement | null;
    if (msg) msg.textContent = opts.message;
    const ctx = element.querySelector('.nm-notification-context') as HTMLElement | null;
    if (ctx && opts.contextMessage !== undefined) ctx.textContent = opts.contextMessage;
    const icon = element.querySelector('.nm-notification-icon') as HTMLImageElement | null;
    if (icon && opts.iconUrl) icon.src = opts.iconUrl;
    const progressBar = element.querySelector('.nm-notification-progress > span') as HTMLElement | null;
    if (progressBar && typeof opts.progress === 'number') {
      progressBar.style.width = `${Math.max(0, Math.min(100, opts.progress))}%`;
    }
    const image = element.querySelector('.nm-notification-image') as HTMLImageElement | null;
    if (image && opts.imageUrl) image.src = opts.imageUrl;
  }

  private resetAutoDismiss(item: ActiveNotification): void {
    if (item.autoDismissTimer !== null) {
      clearTimeout(item.autoDismissTimer);
      item.autoDismissTimer = null;
    }
    if (item.options.requireInteraction) return;
    item.autoDismissTimer = window.setTimeout(() => {
      this.clear(item.id, false);
    }, AUTO_DISMISS_MS);
  }
}
