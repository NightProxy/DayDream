
import type {
  DownloadChangeEvent,
  DownloadItem,
  DownloadsManager,
} from '@apis/downloads';
import { createIcons, icons } from 'lucide';

const MAX_VISIBLE_CARDS = 12;

interface ShelfCard {
  id: number;
  el: HTMLElement;
  /** Most recent item snapshot for re-render diffing. */
  item: DownloadItem;
}

export class DownloadShelf {
  private slot: HTMLElement | null = null;
  private cardsContainer: HTMLElement | null = null;
  private cards = new Map<number, ShelfCard>();
  private mounted = false;
  private unsub: (() => void) | null = null;
  /**
   * Set of dismissed card IDs — when the user X's a card we keep
   * the id here so subsequent `onChanged` deltas don't resurrect it.
   * Cleared when the shelf is fully cleared.
   */
  private dismissed = new Set<number>();
  /** Whether the shelf is currently shown (display:flex). */
  private visible = false;
  /**
   * Whether new downloads should auto-show the shelf. Toggled by the
   * Downloads settings section ("Show download shelf"); persisted via
   * SettingsAPI under `settings.downloadShelfAutoShow`. Defaults to true
   * so existing users see the shelf out of the box.
   */
  public autoShow: boolean = true;

  /**
   * Mount the shelf into its host slot. Returns true on success.
   * The slot must already exist in the DOM (set up in render.ts).
   * Idempotent — multiple calls are safe; second+ calls return true
   * without re-binding.
   */
  install(): boolean {
    if (this.mounted) return true;
    const shadow = (window as { d?: ShadowRoot | Document }).d ?? document;
    const slot = shadow.querySelector('[data-component="download-shelf"]') as HTMLElement | null;
    if (!slot) return false;
    this.slot = slot;
    this.buildSkeleton();
    this.subscribe();
    this.mounted = true;

    void (async () => {
      try {
        const mod = await import('../../apis/settings');
        const SettingsAPI = (mod as { SettingsAPI: new () => { getItem: (k: string) => Promise<unknown> } }).SettingsAPI;
        const api = new SettingsAPI();
        const stored = await api.getItem('settings.downloadShelfAutoShow');
        if (stored != null) this.autoShow = Boolean(stored);
      } catch { /* ignore — defaults to true */ }
    })();

    return true;
  }

  /** Build the shelf's static DOM. Hidden until the first event. */
  private buildSkeleton(): void {
    if (!this.slot) return;
    this.slot.innerHTML = '';
    Object.assign(this.slot.style, {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      minHeight: '52px',
    } satisfies Partial<CSSStyleDeclaration>);

    const cards = document.createElement('div');
    Object.assign(cards.style, {
      flex: '1',
      display: 'flex',
      flexDirection: 'row',
      gap: '8px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--main) transparent',
    } satisfies Partial<CSSStyleDeclaration>);
    cards.setAttribute('data-component', 'download-shelf-cards');
    this.cardsContainer = cards;
    this.slot.appendChild(cards);

    const right = document.createElement('div');
    Object.assign(right.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      paddingLeft: '8px',
      borderLeft: '1px solid var(--white-08)',
      flexShrink: '0',
    } satisfies Partial<CSSStyleDeclaration>);

    const showAll = this.makeIconButton('list', 'Show all downloads');
    showAll.addEventListener('click', () => {
      try {
        window.tabs?.createTab('ddx://downloads/');
      } catch (err) {
        console.warn('[shelf] failed to open downloads page:', err);
      }
    });
    right.appendChild(showAll);

    const closeBtn = this.makeIconButton('x', 'Close shelf');
    closeBtn.addEventListener('click', () => this.hide());
    right.appendChild(closeBtn);

    this.slot.appendChild(right);
    createIcons({ icons });
  }

  /** Subscribe to the manager's change events. */
  private subscribe(): void {
    const mgr = (window as { downloadsManager?: DownloadsManager }).downloadsManager;
    if (!mgr) {
      console.warn('[shelf] DownloadsManager not available; shelf inactive');
      return;
    }
    this.unsub = mgr.addChangeListener((event) => this.onEvent(event));
  }

  private onEvent(event: DownloadChangeEvent): void {
    if (event.type === 'created') {
      if (this.dismissed.has(event.item.id)) return;
      this.addCard(event.item);
      if (this.autoShow) this.show();
      return;
    }
    if (event.type === 'changed') {
      const id = event.delta.id;
      const card = this.cards.get(id);
      if (!card) return;
      const item: DownloadItem = { ...card.item };
      if (event.delta.state) item.state = event.delta.state.current;
      if (event.delta.paused) item.paused = event.delta.paused.current;
      if (event.delta.bytesReceived) item.bytesReceived = event.delta.bytesReceived.current;
      if (event.delta.totalBytes) item.totalBytes = event.delta.totalBytes.current;
      if (event.delta.filename) item.filename = event.delta.filename.current;
      if (event.delta.error) item.error = event.delta.error.current;
      if (event.delta.endTime) item.endTime = event.delta.endTime.current;
      card.item = item;
      this.renderCard(card);
      return;
    }
    if (event.type === 'erased') {
      this.removeCard(event.id);
      return;
    }
  }

  private addCard(item: DownloadItem): void {
    if (!this.cardsContainer) return;
    if (this.cards.size >= MAX_VISIBLE_CARDS) {
      const oldest = this.cards.keys().next().value;
      if (oldest !== undefined) this.removeCard(oldest);
    }
    const el = document.createElement('div');
    el.setAttribute('data-download-id', String(item.id));
    Object.assign(el.style, {
      flex: '0 0 240px',
      minWidth: '240px',
      maxWidth: '320px',
      background: 'var(--bg-2)',
      border: '1px solid var(--white-08)',
      borderRadius: '8px',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      fontSize: '12px',
      color: 'var(--text)',
      position: 'relative',
    } satisfies Partial<CSSStyleDeclaration>);

    const card: ShelfCard = { id: item.id, el, item };
    this.cards.set(item.id, card);
    this.cardsContainer.appendChild(el);
    this.renderCard(card);
  }

  /**
   * Re-render a card's contents from its current item snapshot.
   * Cheap to call on every delta (≤ 240px wide DOM tree).
   */
  private renderCard(card: ShelfCard): void {
    const { item, el } = card;
    el.innerHTML = '';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    } satisfies Partial<CSSStyleDeclaration>);

    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', pickIcon(item));
    Object.assign(icon.style, {
      width: '14px',
      height: '14px',
      flexShrink: '0',
      color: iconColor(item),
    } satisfies Partial<CSSStyleDeclaration>);
    header.appendChild(icon);

    const name = document.createElement('div');
    name.title = item.filename;
    name.textContent = item.filename;
    Object.assign(name.style, {
      flex: '1',
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontWeight: '500',
    } satisfies Partial<CSSStyleDeclaration>);
    header.appendChild(name);

    const dismiss = this.makeIconButton('x', 'Dismiss', 'h-3 w-3');
    Object.assign(dismiss.style, {
      width: '20px',
      height: '20px',
      flexShrink: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissed.add(item.id);
      this.removeCard(item.id);
    });
    header.appendChild(dismiss);

    el.appendChild(header);

    const body = document.createElement('div');
    Object.assign(body.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
    } satisfies Partial<CSSStyleDeclaration>);

    if (item.state === 'in_progress') {
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        height: '3px',
        background: 'var(--white-08)',
        borderRadius: '2px',
        overflow: 'hidden',
      } satisfies Partial<CSSStyleDeclaration>);
      const fill = document.createElement('div');
      const pct = computePercent(item);
      Object.assign(fill.style, {
        height: '100%',
        width: pct >= 0 ? `${pct}%` : '30%',
        background: 'var(--main)',
        borderRadius: '2px',
        transition: 'width .15s ease',
        ...(pct < 0 ? { animation: 'ddx-shelf-pulse 1.4s ease-in-out infinite' } : {}),
      } satisfies Partial<CSSStyleDeclaration>);
      bar.appendChild(fill);
      body.appendChild(bar);

      const status = document.createElement('div');
      status.textContent = item.paused ? 'Paused — ' + bytesLabel(item) : bytesLabel(item);
      Object.assign(status.style, {
        fontSize: '11px',
        color: 'var(--proto)',
      } satisfies Partial<CSSStyleDeclaration>);
      body.appendChild(status);
    } else if (item.state === 'complete') {
      const status = document.createElement('div');
      status.textContent = 'Complete · ' + sizeLabel(item.fileSize >= 0 ? item.fileSize : item.bytesReceived);
      Object.assign(status.style, {
        fontSize: '11px',
        color: 'var(--success)',
      } satisfies Partial<CSSStyleDeclaration>);
      body.appendChild(status);

      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        gap: '6px',
        marginTop: '2px',
      } satisfies Partial<CSSStyleDeclaration>);
      const openBtn = this.makeTextButton('Open');
      openBtn.addEventListener('click', () => {
        try {
          window.tabs?.createTab(item.finalUrl || item.url);
        } catch (err) {
          console.warn('[shelf] open failed:', err);
        }
      });
      actions.appendChild(openBtn);
      body.appendChild(actions);
    } else {
      const status = document.createElement('div');
      status.textContent = humanError(item.error) || 'Failed';
      Object.assign(status.style, {
        fontSize: '11px',
        color: 'var(--error)',
      } satisfies Partial<CSSStyleDeclaration>);
      body.appendChild(status);
    }
    el.appendChild(body);

    createIcons({ icons });
  }

  private removeCard(id: number): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.el.remove();
    this.cards.delete(id);
    if (this.cards.size === 0) this.hide();
  }

  /** Show the shelf (idempotent). */
  show(): void {
    if (this.visible || !this.slot) return;
    this.slot.style.display = 'flex';
    this.visible = true;
  }

  /** Hide the shelf (idempotent). Cards persist in memory. */
  hide(): void {
    if (!this.visible || !this.slot) return;
    this.slot.style.display = 'none';
    this.visible = false;
  }

  /** Programmatically toggle (e.g. from a menu shortcut). */
  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  /**
   * Set whether new downloads auto-show the shelf. Persistence is the
   * caller's responsibility (the settings UI writes to SettingsAPI and
   * also calls this for live update).
   */
  setAutoShow(value: boolean): void {
    this.autoShow = value;
  }

  /**
   * Erase all cards and hide the shelf. Doesn't touch the manager's
   * history — only the strip's in-memory representation.
   */
  clear(): void {
    for (const card of this.cards.values()) {
      card.el.remove();
    }
    this.cards.clear();
    this.dismissed.clear();
    this.hide();
  }

  /** Tear down (mostly for tests). */
  uninstall(): void {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.unsub) {
      try { this.unsub(); } catch { /* swallow */ }
      this.unsub = null;
    }
    this.clear();
    if (this.slot) this.slot.innerHTML = '';
  }

  private makeIconButton(icon: string, label: string, sizeClass = 'h-4 w-4'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    Object.assign(btn.style, {
      width: '26px',
      height: '26px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '6px',
      color: 'var(--text)',
      cursor: 'pointer',
      padding: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--white-05)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    const i = document.createElement('i');
    i.setAttribute('data-lucide', icon);
    i.className = sizeClass;
    btn.appendChild(i);
    return btn;
  }

  private makeTextButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    Object.assign(btn.style, {
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '4px',
      background: 'var(--white-05)',
      border: '1px solid var(--white-08)',
      color: 'var(--text)',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--white-10)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--white-05)'; });
    return btn;
  }
}

function pickIcon(item: DownloadItem): string {
  if (item.state === 'interrupted') return 'alert-triangle';
  if (item.state === 'complete') return 'file-down';
  if (item.paused) return 'pause';
  return 'download';
}

function iconColor(item: DownloadItem): string {
  if (item.state === 'interrupted') return 'var(--error)';
  if (item.state === 'complete') return 'var(--success)';
  return 'var(--main)';
}

/** Returns 0-100 if known, -1 for indeterminate. */
function computePercent(item: DownloadItem): number {
  if (item.totalBytes <= 0) return -1;
  return Math.max(0, Math.min(100, Math.floor((item.bytesReceived / item.totalBytes) * 100)));
}

function bytesLabel(item: DownloadItem): string {
  if (item.totalBytes > 0) {
    return `${sizeLabel(item.bytesReceived)} / ${sizeLabel(item.totalBytes)}`;
  }
  return sizeLabel(item.bytesReceived);
}

function sizeLabel(bytes: number): string {
  if (bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function humanError(reason: string | undefined): string | null {
  if (!reason) return null;
  return reason
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
