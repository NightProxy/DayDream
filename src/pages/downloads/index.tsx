// ddx://downloads/ — the full download manager page.
//
// Renders inside its own iframe; reads from the HOST's
// DownloadsManager via `window.parent.downloadsManager` so the
// history is consistent with what the shelf shows.
//
// Real-time: subscribes to the manager's change events; per-card
// re-render on every delta. Search + state filter are debounced
// re-render passes (no separate query, just client-side filter
// over the manager's snapshot).

import '@css/tailwind.css';
import '@css/global.scss';
import '@css/internal.scss';
import 'basecoat-css/all';
import '@utils/global/panic';
import '@pages/shared/themeInit';
import { createIcons, icons } from 'lucide';
import type {
  DownloadChangeEvent,
  DownloadItem,
  DownloadState,
  DownloadsManager,
} from '@apis/downloads';

interface ParentBridge {
  downloadsManager?: DownloadsManager;
  tabs?: { createTab: (url: string) => Promise<unknown> | unknown };
}

class DownloadsUI {
  private mgr: DownloadsManager | null = null;
  private items: Map<number, DownloadItem> = new Map();
  private unsub: (() => void) | null = null;

  private searchInput: HTMLInputElement;
  private searchClearBtn: HTMLButtonElement;
  private clearAllBtn: HTMLButtonElement;
  private filterStateSelect: HTMLSelectElement;
  private activeSec: HTMLElement;
  private activeList: HTMLElement;
  private historySec: HTMLElement;
  private historyList: HTMLElement;
  private emptyState: HTMLElement;
  private countEl: HTMLElement;

  private searchQuery = '';
  private stateFilter: 'all' | DownloadState = 'all';

  constructor() {
    this.searchInput = document.getElementById('dl-search') as HTMLInputElement;
    this.searchClearBtn = document.getElementById('dl-search-clear') as HTMLButtonElement;
    this.clearAllBtn = document.getElementById('dl-clear-all') as HTMLButtonElement;
    this.filterStateSelect = document.getElementById('dl-filter-state') as HTMLSelectElement;
    this.activeSec = document.getElementById('dl-active')!;
    this.activeList = document.getElementById('dl-active-list')!;
    this.historySec = document.getElementById('dl-history')!;
    this.historyList = document.getElementById('dl-history-list')!;
    this.emptyState = document.getElementById('dl-empty')!;
    this.countEl = document.getElementById('dl-count')!;

    void this.init();
  }

  private async init(): Promise<void> {
    const parent = window.parent as unknown as ParentBridge;
    this.mgr = parent.downloadsManager ?? null;
    if (!this.mgr) {
      console.warn(
        '[downloads-page] DownloadsManager not available on parent window — page will be empty',
      );
      this.render();
      createIcons({ icons });
      return;
    }

    // Seed from existing state.
    const all = await this.mgr.search({});
    for (const item of all) this.items.set(item.id, item);

    // Subscribe.
    this.unsub = this.mgr.addChangeListener((event) => this.onEvent(event));

    this.setupListeners();
    this.render();
    createIcons({ icons });

    // Re-hydrate icons on any DOM mutation.
    window.addEventListener('beforeunload', () => {
      if (this.unsub) this.unsub();
    });
  }

  private onEvent(event: DownloadChangeEvent): void {
    if (event.type === 'created') {
      this.items.set(event.item.id, event.item);
      this.render();
      return;
    }
    if (event.type === 'changed') {
      const id = event.delta.id;
      const item = this.items.get(id);
      if (!item) return;
      // Apply delta.
      const next: DownloadItem = { ...item };
      if (event.delta.state) next.state = event.delta.state.current;
      if (event.delta.paused) next.paused = event.delta.paused.current;
      if (event.delta.bytesReceived) next.bytesReceived = event.delta.bytesReceived.current;
      if (event.delta.totalBytes) next.totalBytes = event.delta.totalBytes.current;
      if (event.delta.filename) next.filename = event.delta.filename.current;
      if (event.delta.error) next.error = event.delta.error.current;
      if (event.delta.endTime) next.endTime = event.delta.endTime.current;
      this.items.set(id, next);
      this.render();
      return;
    }
    if (event.type === 'erased') {
      this.items.delete(event.id);
      this.render();
      return;
    }
  }

  private setupListeners(): void {
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.render();
    });
    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.render();
    });
    this.filterStateSelect.addEventListener('change', () => {
      this.stateFilter = this.filterStateSelect.value as typeof this.stateFilter;
      this.render();
    });
    this.clearAllBtn.addEventListener('click', async () => {
      if (!confirm('Clear ALL download history? This cannot be undone.')) return;
      try {
        await this.mgr?.clearAll();
      } catch (err) {
        console.warn('[downloads-page] clearAll failed:', err);
      }
    });
  }

  private filteredItems(): DownloadItem[] {
    const all = [...this.items.values()];
    return all
      .filter((i) => {
        if (this.stateFilter !== 'all' && i.state !== this.stateFilter) return false;
        if (this.searchQuery) {
          const hay = `${i.filename}\n${i.url}`.toLowerCase();
          if (!hay.includes(this.searchQuery)) return false;
        }
        return true;
      })
      .sort((a, b) => b.startTime - a.startTime);
  }

  private render(): void {
    const items = this.filteredItems();
    this.countEl.textContent = String(items.length);

    if (items.length === 0) {
      this.emptyState.removeAttribute('hidden');
      this.activeSec.setAttribute('hidden', '');
      this.historySec.setAttribute('hidden', '');
      return;
    }
    this.emptyState.setAttribute('hidden', '');

    const active = items.filter((i) => i.state === 'in_progress');
    const history = items.filter((i) => i.state !== 'in_progress');

    if (active.length > 0) {
      this.activeSec.removeAttribute('hidden');
      this.activeList.innerHTML = '';
      for (const item of active) this.activeList.appendChild(this.makeCard(item));
    } else {
      this.activeSec.setAttribute('hidden', '');
    }

    if (history.length > 0) {
      this.historySec.removeAttribute('hidden');
      this.historyList.innerHTML = '';
      for (const item of history) this.historyList.appendChild(this.makeCard(item));
    } else {
      this.historySec.setAttribute('hidden', '');
    }

    createIcons({ icons });
  }

  private makeCard(item: DownloadItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'dl-card';
    card.setAttribute('data-download-id', String(item.id));

    // Icon.
    const iconWrap = document.createElement('div');
    iconWrap.className = 'dl-icon';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', pickIcon(item));
    icon.className = 'h-5 w-5';
    icon.style.color = iconColor(item);
    iconWrap.appendChild(icon);
    card.appendChild(iconWrap);

    // Body: filename / meta / progress.
    const body = document.createElement('div');
    body.className = 'dl-body';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex; gap:8px; align-items:center;';
    const fname = document.createElement('div');
    fname.className = 'dl-filename';
    fname.textContent = item.filename;
    fname.title = item.filename;
    top.appendChild(fname);
    const badge = document.createElement('span');
    badge.className = `dl-state-badge ${item.state}`;
    badge.textContent = stateLabel(item);
    top.appendChild(badge);
    body.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'dl-meta';
    const source = document.createElement('span');
    source.className = 'dl-source';
    source.textContent = item.url;
    source.title = item.url;
    meta.appendChild(source);
    if (item.state === 'in_progress') {
      const bytes = document.createElement('span');
      bytes.textContent = bytesLabel(item);
      meta.appendChild(bytes);
    } else if (item.state === 'complete') {
      const sz = document.createElement('span');
      sz.textContent = sizeLabel(item.fileSize >= 0 ? item.fileSize : item.bytesReceived);
      meta.appendChild(sz);
    } else if (item.state === 'interrupted') {
      const err = document.createElement('span');
      err.style.color = 'var(--error)';
      err.textContent = humanError(item.error) || 'Failed';
      meta.appendChild(err);
    }
    if (item.startTime) {
      const time = document.createElement('span');
      time.textContent = '• ' + formatRelativeTime(item.startTime);
      meta.appendChild(time);
    }
    body.appendChild(meta);

    if (item.state === 'in_progress') {
      const track = document.createElement('div');
      track.className = 'dl-progress-track';
      const fill = document.createElement('div');
      const pct = computePercent(item);
      fill.className = 'dl-progress-fill' + (pct < 0 ? ' indeterminate' : '');
      if (pct >= 0) fill.style.width = `${pct}%`;
      track.appendChild(fill);
      body.appendChild(track);
    }

    card.appendChild(body);

    // Actions.
    const actions = document.createElement('div');
    actions.className = 'dl-actions';

    if (item.state === 'in_progress') {
      if (item.paused) {
        actions.appendChild(this.actionButton('play', 'Resume', () => this.mgr?.resume(item.id)));
      } else {
        actions.appendChild(this.actionButton('pause', 'Pause', () => this.mgr?.pause(item.id)));
      }
      actions.appendChild(this.actionButton('x', 'Cancel', () => this.mgr?.cancel(item.id)));
    } else if (item.state === 'complete') {
      actions.appendChild(
        this.actionButton('external-link', 'Open', () => {
          try {
            (window.parent as unknown as ParentBridge).tabs?.createTab(item.finalUrl || item.url);
          } catch { /* swallow */ }
        }),
      );
      actions.appendChild(
        this.actionButton('trash-2', 'Remove', () => this.mgr?.erase({ id: item.id }), true),
      );
    } else {
      actions.appendChild(
        this.actionButton('rotate-cw', 'Retry', () => {
          try {
            void this.mgr?.startDownload({ url: item.url, filename: item.filename });
            void this.mgr?.erase({ id: item.id });
          } catch { /* swallow */ }
        }),
      );
      actions.appendChild(
        this.actionButton('trash-2', 'Remove', () => this.mgr?.erase({ id: item.id }), true),
      );
    }

    card.appendChild(actions);
    return card;
  }

  private actionButton(icon: string, label: string, onClick: () => unknown, danger = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dl-action-btn' + (danger ? ' danger' : '');
    btn.title = label;
    const i = document.createElement('i');
    i.setAttribute('data-lucide', icon);
    i.className = 'h-4 w-4';
    btn.appendChild(i);
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener('click', () => {
      try { void onClick(); } catch (err) { console.warn(err); }
    });
    return btn;
  }
}

// ── helpers (shared shape with shelf.ts) ──────────────────────────

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

function stateLabel(item: DownloadItem): string {
  if (item.state === 'in_progress') return item.paused ? 'Paused' : 'Active';
  if (item.state === 'complete') return 'Done';
  return 'Failed';
}

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
  return reason.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ui = new DownloadsUI();
  (window as unknown as { downloadsUI: DownloadsUI }).downloadsUI = ui;
  createIcons({ icons });
});
