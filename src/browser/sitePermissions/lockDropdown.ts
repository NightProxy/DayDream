
import { createIcons, icons } from 'lucide';
import type { PermissionGrant, PermissionState, SitePermissionsStore } from '@apis/sitePermissions';

/** Friendly permission label table — same set used host-side. */
const FRIENDLY_LABELS: Record<string, { icon: string; label: string }> = {
  geolocation: { icon: 'map-pin', label: 'Location' },
  notifications: { icon: 'bell', label: 'Notifications' },
  camera: { icon: 'camera', label: 'Camera' },
  microphone: { icon: 'mic', label: 'Microphone' },
  midi: { icon: 'music-2', label: 'MIDI devices' },
  'background-sync': { icon: 'refresh-cw', label: 'Background sync' },
  'persistent-storage': { icon: 'database', label: 'Persistent storage' },
  push: { icon: 'send', label: 'Push notifications' },
  'screen-wake-lock': { icon: 'monitor', label: 'Keep screen on' },
  'clipboard-read': { icon: 'clipboard', label: 'Read clipboard' },
  'clipboard-write': { icon: 'clipboard-paste', label: 'Write to clipboard' },
  'display-capture': { icon: 'monitor-up', label: 'Screen sharing' },
  'storage-access': { icon: 'database', label: 'Cross-site storage' },
  'system-wake-lock': { icon: 'cpu', label: 'Keep system awake' },
};

function labelFor(name: string): { icon: string; label: string } {
  return FRIENDLY_LABELS[name] ?? { icon: 'shield', label: name };
}

export class LockDropdown {
  private lockBtn: HTMLButtonElement | null = null;
  private popover: HTMLDivElement | null = null;
  private mounted = false;
  /** Track an outside-click handler so we can detach on close. */
  private outsideHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Find the `[data-component="site-info"]` button in the shadow DOM
   * and wire its click. Idempotent.
   */
  install(): boolean {
    if (this.mounted) return true;
    const shadow = (window as { d?: ShadowRoot | Document }).d ?? document;
    const btn = shadow.querySelector('[data-component="site-info"]') as HTMLButtonElement | null;
    if (!btn) return false;
    this.lockBtn = btn;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.mounted = true;
    return true;
  }

  toggle(): void {
    if (this.popover) this.close();
    else this.open();
  }

  private async open(): Promise<void> {
    if (!this.lockBtn) return;
    const origin = this.currentOrigin();
    const popover = this.buildPopover(origin);
    this.popover = popover;
    document.body.appendChild(popover);

    const rect = this.lockBtn.getBoundingClientRect();
    Object.assign(popover.style, {
      top: `${rect.bottom + 6}px`,
      left: `${rect.left}px`,
    });
    requestAnimationFrame(() => {
      const pr = popover.getBoundingClientRect();
      if (pr.right > window.innerWidth - 8) {
        popover.style.left = `${Math.max(8, window.innerWidth - pr.width - 8)}px`;
      }
      popover.style.opacity = '1';
      popover.style.transform = 'translateY(0)';
    });

    this.outsideHandler = (e: MouseEvent): void => {
      if (!this.popover) return;
      if (this.popover.contains(e.target as Node)) return;
      if (this.lockBtn?.contains(e.target as Node)) return;
      this.close();
    };
    setTimeout(() => {
      if (this.outsideHandler) {
        document.addEventListener('click', this.outsideHandler);
      }
    }, 0);

    await this.fillBody(popover, origin);
  }

  close(): void {
    if (!this.popover) return;
    const p = this.popover;
    this.popover = null;
    p.style.opacity = '0';
    p.style.transform = 'translateY(-4px)';
    setTimeout(() => p.remove(), 140);
    if (this.outsideHandler) {
      document.removeEventListener('click', this.outsideHandler);
      this.outsideHandler = null;
    }
  }

  /**
   * Resolve the URL of the currently-active iframe. We prefer the
   * iframe's live `src` decoded back to user-visible form; fall back
   * to the address bar's value.
   */
  private currentOrigin(): string {
    try {
      const w = window as { tabs?: { activeTabId?: string | null; frameByTabId?: Map<string, HTMLIFrameElement>; proxy?: { decodeUrl?: (u: string) => string } } };
      const tabs = w.tabs;
      const id = tabs?.activeTabId;
      if (id) {
        const iframe = tabs?.frameByTabId?.get(id);
        const src = iframe?.src ?? '';
        let decoded = src;
        try { decoded = tabs?.proxy?.decodeUrl?.(src) ?? src; } catch { /* swallow */ }
        try { return new URL(decoded).origin; } catch { /* fall through */ }
      }
      const shadow = (window as { d?: ShadowRoot | Document }).d ?? document;
      const ab = shadow.querySelector('[data-component="address-bar"]') as HTMLInputElement | null;
      if (ab?.value) {
        try { return new URL(ab.value).origin; } catch { /* fall through */ }
        try { return new URL(`https://${ab.value}`).origin; } catch { /* fall through */ }
      }
    } catch { /* swallow */ }
    return '';
  }

  private buildPopover(origin: string): HTMLDivElement {
    const popover = document.createElement('div');
    popover.setAttribute('data-component', 'lock-dropdown');
    Object.assign(popover.style, {
      position: 'fixed',
      width: '340px',
      maxHeight: 'min(560px, calc(100vh - 24px))',
      overflowY: 'auto',
      background: 'var(--bg-1)',
      border: '1px solid var(--white-08)',
      borderRadius: '10px',
      boxShadow: '0 8px 32px var(--shadow-outer)',
      color: 'var(--text)',
      fontSize: '13px',
      zIndex: '99999999',
      padding: '0',
      opacity: '0',
      transform: 'translateY(-4px)',
      transition: 'opacity .12s ease, transform .12s ease',
    } satisfies Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '14px 16px 10px',
      borderBottom: '1px solid var(--white-08)',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    Object.assign(title.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontWeight: '600',
      fontSize: '13px',
    } satisfies Partial<CSSStyleDeclaration>);
    const lockI = document.createElement('i');
    lockI.setAttribute('data-lucide', 'lock');
    lockI.className = 'h-4 w-4';
    lockI.style.color = 'var(--success)';
    title.appendChild(lockI);
    const tText = document.createElement('span');
    tText.textContent = 'Connection is secure';
    title.appendChild(tText);
    header.appendChild(title);

    const originLine = document.createElement('div');
    originLine.textContent = origin || '(no active site)';
    Object.assign(originLine.style, {
      marginTop: '6px',
      fontSize: '11px',
      color: 'var(--proto)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    header.appendChild(originLine);
    popover.appendChild(header);

    const body = document.createElement('div');
    body.setAttribute('data-component', 'lock-dropdown-body');
    Object.assign(body.style, { padding: '4px 0' } satisfies Partial<CSSStyleDeclaration>);
    popover.appendChild(body);

    return popover;
  }

  /** Async-populate the body. */
  private async fillBody(popover: HTMLDivElement, origin: string): Promise<void> {
    const body = popover.querySelector('[data-component="lock-dropdown-body"]') as HTMLDivElement;
    if (!body) return;
    body.innerHTML = '';

    if (!origin) {
      const empty = document.createElement('div');
      empty.textContent = 'No site information available for the current tab.';
      Object.assign(empty.style, {
        padding: '16px',
        fontSize: '12px',
        color: 'var(--proto)',
        textAlign: 'center',
      } satisfies Partial<CSSStyleDeclaration>);
      body.appendChild(empty);
      createIcons({ icons });
      return;
    }

    const store = (window as { sitePermissionsStore?: SitePermissionsStore }).sitePermissionsStore;
    const grants = store ? await store.listForOrigin(origin) : [];
    if (grants.length > 0) {
      const sec = this.section('Permissions');
      body.appendChild(sec.header);
      for (const grant of grants) {
        body.appendChild(this.permissionRow(grant, store!));
      }
    }

    const dataSec = this.section('Site data');
    body.appendChild(dataSec.header);
    const dataRow = document.createElement('div');
    Object.assign(dataRow.style, {
      padding: '6px 16px 8px',
      fontSize: '12px',
      color: 'var(--proto)',
    } satisfies Partial<CSSStyleDeclaration>);
    dataRow.textContent = 'Cookies and stored data may be present for this site.';
    body.appendChild(dataRow);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    Object.assign(clearBtn.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      padding: '8px 16px',
      background: 'transparent',
      border: 'none',
      color: 'var(--text)',
      cursor: 'pointer',
      fontSize: '13px',
      textAlign: 'left',
    } satisfies Partial<CSSStyleDeclaration>);
    const ci = document.createElement('i');
    ci.setAttribute('data-lucide', 'trash-2');
    ci.className = 'h-4 w-4';
    ci.style.color = 'var(--error)';
    clearBtn.appendChild(ci);
    const cspan = document.createElement('span');
    cspan.textContent = 'Clear data for this site';
    clearBtn.appendChild(cspan);
    clearBtn.addEventListener('mouseenter', () => { clearBtn.style.background = 'var(--white-05)'; });
    clearBtn.addEventListener('mouseleave', () => { clearBtn.style.background = 'transparent'; });
    clearBtn.addEventListener('click', async () => {
      try {
        const { SiteDataManager } = await import('@apis/siteData') as { SiteDataManager: typeof import('@apis/siteData').SiteDataManager };
        const sdm = SiteDataManager.getInstance();
        const result = await sdm.clearAll(origin);
        const total = result.cookies + result.localStorageKeys + result.sessionStorageKeys;
        const msg = total === 0
          ? 'No data found to clear.'
          : `Cleared ${result.cookies} cookies, ${result.localStorageKeys + result.sessionStorageKeys} storage entries.`;
        try {
          window.nightmare?.notifications?.show({
            title: 'Site data cleared',
            message: msg,
          });
        } catch { /* swallow */ }
        this.close();
      } catch (err) {
        console.warn('[lockDropdown] clear failed:', err);
      }
    });
    body.appendChild(clearBtn);

    if (grants.length > 0) {
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset permissions';
      Object.assign(resetBtn.style, {
        display: 'block',
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        color: 'var(--proto)',
        cursor: 'pointer',
        fontSize: '12px',
        textAlign: 'left',
      } satisfies Partial<CSSStyleDeclaration>);
      resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'var(--white-05)'; resetBtn.style.color = 'var(--text)'; });
      resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'transparent'; resetBtn.style.color = 'var(--proto)'; });
      resetBtn.addEventListener('click', async () => {
        try {
          await store?.clearForOrigin(origin);
          await this.fillBody(popover, origin);
        } catch (err) {
          console.warn('[lockDropdown] reset failed:', err);
        }
      });
      body.appendChild(resetBtn);
    }

    const sep = document.createElement('div');
    Object.assign(sep.style, { height: '1px', background: 'var(--white-08)', margin: '6px 0' } satisfies Partial<CSSStyleDeclaration>);
    body.appendChild(sep);
    const settingsLink = document.createElement('button');
    settingsLink.type = 'button';
    Object.assign(settingsLink.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      padding: '8px 16px',
      background: 'transparent',
      border: 'none',
      color: 'var(--text)',
      cursor: 'pointer',
      fontSize: '13px',
      textAlign: 'left',
    } satisfies Partial<CSSStyleDeclaration>);
    const si = document.createElement('i');
    si.setAttribute('data-lucide', 'settings');
    si.className = 'h-4 w-4';
    settingsLink.appendChild(si);
    const sspan = document.createElement('span');
    sspan.style.flex = '1';
    sspan.textContent = 'Site settings';
    settingsLink.appendChild(sspan);
    const sarrow = document.createElement('i');
    sarrow.setAttribute('data-lucide', 'chevron-right');
    sarrow.className = 'h-4 w-4';
    sarrow.style.color = 'var(--proto)';
    settingsLink.appendChild(sarrow);
    settingsLink.addEventListener('mouseenter', () => { settingsLink.style.background = 'var(--white-05)'; });
    settingsLink.addEventListener('mouseleave', () => { settingsLink.style.background = 'transparent'; });
    settingsLink.addEventListener('click', () => {
      try {
        window.tabs?.createTab('ddx://settings/#SitePermissions');
        this.close();
      } catch (err) {
        console.warn('[lockDropdown] open settings failed:', err);
      }
    });
    body.appendChild(settingsLink);

    createIcons({ icons });
  }

  private section(title: string): { header: HTMLElement } {
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '10px 16px 4px',
      fontSize: '11px',
      fontWeight: '600',
      color: 'var(--proto)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);
    header.textContent = title;
    return { header };
  }

  /**
   * One permission row with an inline state selector.
   * Selector cycles `allow → block → ask (clear)` on click; mirrors
   * Chrome's quick-toggle in the site info panel.
   */
  private permissionRow(grant: PermissionGrant, store: SitePermissionsStore): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 16px',
      fontSize: '13px',
    } satisfies Partial<CSSStyleDeclaration>);

    const info = labelFor(grant.name);
    const iconI = document.createElement('i');
    iconI.setAttribute('data-lucide', info.icon);
    iconI.className = 'h-4 w-4';
    iconI.style.color = 'var(--proto)';
    iconI.style.flexShrink = '0';
    row.appendChild(iconI);

    const label = document.createElement('span');
    label.textContent = info.label;
    Object.assign(label.style, { flex: '1' } satisfies Partial<CSSStyleDeclaration>);
    row.appendChild(label);

    const select = document.createElement('select');
    Object.assign(select.style, {
      background: 'var(--bg-2)',
      color: 'var(--text)',
      border: '1px solid var(--white-08)',
      borderRadius: '6px',
      padding: '2px 6px',
      fontSize: '12px',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    const opts: PermissionState[] = ['granted', 'denied', 'prompt'];
    const labels: Record<PermissionState, string> = { granted: 'Allow', denied: 'Block', prompt: 'Ask' };
    for (const opt of opts) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labels[opt];
      if (opt === grant.state) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', async () => {
      try {
        await store.setState(grant.origin, grant.name, select.value as PermissionState);
      } catch (err) {
        console.warn('[lockDropdown] setState failed:', err);
      }
    });
    row.appendChild(select);

    return row;
  }

  uninstall(): void {
    if (!this.mounted) return;
    this.close();
    this.mounted = false;
    this.lockBtn = null;
  }
}
