import '@css/tailwind.css';
import '@css/global.scss';
import '@css/internal.scss';
import 'basecoat-css/all';
import '@utils/global/panic';
import '@pages/shared/themeInit';
import { createIcons, icons } from 'lucide';
import { HistoryManager, type HistoryEntry } from '@apis/history';

class HistoryUI {
	private historyManager: HistoryManager;
	private searchQuery: string = '';
	private isLoading: boolean = false;

	private historyWindow: HTMLElement;
	private emptyState: HTMLElement;
	private searchInput: HTMLInputElement;
	private searchClearBtn: HTMLButtonElement;
	private clearAllBtn: HTMLButtonElement;
	private historyCount: HTMLElement;

	constructor() {
		this.historyManager = HistoryManager.getInstance();

		this.historyWindow = document.getElementById('history-window')!;
		this.emptyState = document.getElementById('history-empty')!;
		this.searchInput = document.getElementById(
			'history-search'
		) as HTMLInputElement;
		this.searchClearBtn = document.getElementById(
			'history-search-clear'
		) as HTMLButtonElement;
		this.clearAllBtn = document.getElementById(
			'clear-all-history'
		) as HTMLButtonElement;
		this.historyCount = document.getElementById('history-count')!;

		this.init();
	}

	private async init() {
		await this.historyManager.loadFromStorage();
		this.setupEventListeners();
		await this.renderHistory();
		this.updateStats();
		this.setupPeriodicMaintenance();
		createIcons({ icons });
	}

	private setupEventListeners() {
		this.searchInput?.addEventListener('input', () => {
			this.searchQuery = this.searchInput.value.trim();
			this.renderHistory();
		});

		this.searchClearBtn?.addEventListener('click', () => {
			this.searchInput.value = '';
			this.searchQuery = '';
			this.renderHistory();
		});

		this.clearAllBtn?.addEventListener('click', async () => {
			if (
				confirm(
					'Are you sure you want to clear all browsing history? This action cannot be undone.'
				)
			) {
				await this.historyManager.clearAll();
				await this.renderHistory();
				this.updateStats();
			}
		});

		const exportBtn = document.getElementById('export-history');
		const importBtn = document.getElementById('import-history');

		exportBtn?.addEventListener('click', () => this.exportHistory());
		importBtn?.addEventListener('click', () => this.importHistory());

		document.addEventListener('click', async e => {
			const target = e.target as HTMLElement;
			if (
				target.hasAttribute('data-scope') &&
				target.getAttribute('data-scope') === 'day-clear'
			) {
				const daySection = target.closest('[data-day]');
				const dayType = daySection?.getAttribute('data-day');

				if (
					dayType &&
					confirm(
						`Are you sure you want to clear all history from ${dayType}?`
					)
				) {
					await this.clearHistoryByDay(dayType);
				}
			}
		});

		document.addEventListener('click', async e => {
			const target = e.target as HTMLElement;
			const deleteBtn = target.closest("[data-action='delete']");

			if (deleteBtn) {
				e.preventDefault();
				e.stopPropagation();

				const historyItem = deleteBtn.closest('[data-history-id]');
				const entryId = historyItem?.getAttribute('data-history-id');

				if (entryId) {
					await this.historyManager.deleteEntry(entryId);
					await this.renderHistory();
					this.updateStats();
				}
			}
		});

		document.addEventListener('click', e => {
			const target = e.target as HTMLElement;
			const historyLink = target.closest('[data-history-url]');

			if (historyLink && !target.closest("[data-action='delete']")) {
				e.preventDefault();
				const url = historyLink.getAttribute('data-history-url');
				if (url && window.parent.tabs) {
					window.parent.tabs.createTab(url);
				}
			}
		});

		// Right-click on a history row opens our context menu. The menu
		// content is built by the host's `auxiliaryMenus.buildHistoryItemMenu`
		// and rendered by the host's RightClickMenu instance, since this
		// page lives inside an iframe and the menu container needs to be
		// positioned in host viewport coordinates.
		document.addEventListener('contextmenu', (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const item = target.closest('[data-history-url]');
			if (!item) return;
			if (target.closest("[data-action='delete']")) return;

			e.preventDefault();
			e.stopPropagation();

			const parentWin: any = window.parent;
			const auxMenus = parentWin?.tabs?.auxiliaryMenus;
			const rcm = parentWin?.nightmare?.rightclickmenu;
			if (!auxMenus || !rcm) {
				console.warn(
					'[history] auxiliaryMenus / rightclickmenu unavailable in parent'
				);
				return;
			}

			const url = item.getAttribute('data-history-url') || '';
			const entryId = item.getAttribute('data-history-id') || '';
			const titleEl = item.querySelector('h4, .history-title');
			const title = (titleEl?.textContent || url).trim();
			let hostname: string | undefined;
			try {
				hostname = new URL(url).hostname;
			} catch {
				hostname = undefined;
			}

			const menu = auxMenus.buildHistoryItemMenu({
				url,
				title,
				entryId,
				hostname,
				onRemoveEntry: async () => {
					if (entryId) {
						await this.historyManager.deleteEntry(entryId);
						await this.renderHistory();
						this.updateStats();
					}
				},
				onRemoveAllFromSite: async () => {
					if (!hostname) return;
					try {
						const entries = this.historyManager.getEntriesByDomain
							? this.historyManager.getEntriesByDomain(hostname)
							: [];
						for (const entry of entries) {
							await this.historyManager.deleteEntry(entry.id);
						}
						await this.renderHistory();
						this.updateStats();
					} catch (error) {
						console.error(
							'[history] delete-all-from-site failed:',
							error
						);
					}
				}
			});

			// Translate iframe-local mouse coords into host coords for the
			// host-side RightClickMenu container.
			const hostIframe = parentWin.document
				?.querySelector('iframe.active') as HTMLIFrameElement | null;
			const rect = hostIframe?.getBoundingClientRect();
			const hostX = (rect?.left ?? 0) + e.clientX;
			const hostY = (rect?.top ?? 0) + e.clientY;

			const hostDoc: Document = parentWin.document;
			const tempAnchor = hostDoc.createElement('div');
			tempAnchor.style.cssText = `position:fixed;left:${hostX}px;top:${hostY}px;width:1px;height:1px;opacity:0;pointer-events:none;`;
			hostDoc.body.appendChild(tempAnchor);

			const hostEvent = new parentWin.MouseEvent('contextmenu', {
				clientX: hostX,
				clientY: hostY,
				bubbles: false,
				cancelable: true
			});
			Object.defineProperty(hostEvent, 'pageX', { value: hostX });
			Object.defineProperty(hostEvent, 'pageY', { value: hostY });

			rcm.closeMenu();
			rcm.openMenu(tempAnchor, hostEvent, menu);
			setTimeout(() => tempAnchor.remove(), 0);
		});

		this.historyManager.addListener(() => {
			this.renderHistory();
			this.updateStats();
		});
	}

	private async clearHistoryByDay(dayType: string) {
		const now = new Date();
		let startDate: Date;
		let endDate: Date;

		switch (dayType) {
			case 'today':
				startDate = new Date(now);
				startDate.setHours(0, 0, 0, 0);
				endDate = new Date(now);
				endDate.setHours(23, 59, 59, 999);
				break;
			case 'yesterday':
				startDate = new Date(now);
				startDate.setDate(startDate.getDate() - 1);
				startDate.setHours(0, 0, 0, 0);
				endDate = new Date(startDate);
				endDate.setHours(23, 59, 59, 999);
				break;
			case 'older':
				startDate = new Date(0);
				endDate = new Date(now);
				endDate.setDate(endDate.getDate() - 2);
				endDate.setHours(23, 59, 59, 999);
				break;
			default:
				return;
		}

		const deletedCount = await this.historyManager.clearByTimeRange(
			startDate,
			endDate
		);
		console.log(`Cleared ${deletedCount} entries from ${dayType}`);

		await this.renderHistory();
		this.updateStats();
	}

	private async renderHistory() {
		if (this.isLoading) return;
		this.isLoading = true;

		try {
			let entries: HistoryEntry[];

			if (this.searchQuery) {
				const searchResults = this.historyManager.searchEntries(
					this.searchQuery
				);
				entries = searchResults.map(result => result.entry);

				entries.sort(
					(a, b) => b.visitedAt.getTime() - a.visitedAt.getTime()
				);
			} else {
				entries = this.historyManager.getEntries();
			}

			if (entries.length === 0) {
				this.showEmptyState();
				return;
			}

			this.hideEmptyState();

			const groupedEntries = this.groupEntriesByDate(entries);

			const dayContainers =
				this.historyWindow.querySelectorAll('[data-day]');
			dayContainers.forEach(container => {
				const list = container.querySelector('[data-list]');
				if (list) {
					list.innerHTML = '';
				}
			});

			if (this.searchQuery) {
				const todayContainer =
					this.historyWindow.querySelector('[data-day="today"]');
				const list = todayContainer?.querySelector('[data-list]');
				if (list) {
					for (const entry of entries) {
						const historyItem = await this.createHistoryItem(entry);
						list.appendChild(historyItem);
					}
				}

				dayContainers.forEach(container => {
					const day = container.getAttribute('data-day');
					(container as HTMLElement).style.display =
						day === 'today' ? '' : 'none';
				});
			} else {
				for (const [dayKey, dayEntries] of groupedEntries.entries()) {
					await this.renderDayGroup(dayKey, dayEntries);
				}

				dayContainers.forEach(container => {
					const list = container.querySelector('[data-list]');
					const isEmpty = !list || list.children.length === 0;
					(container as HTMLElement).style.display = isEmpty
						? 'none'
						: '';
				});
			}
		} finally {
			this.isLoading = false;
			createIcons({ icons });
		}
	}

	private groupEntriesByDate(
		entries: HistoryEntry[]
	): Map<string, HistoryEntry[]> {
		const groups = new Map<string, HistoryEntry[]>();
		const now = new Date();
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);

		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		entries.forEach(entry => {
			let groupKey: string;

			if (entry.visitedAt >= today) {
				groupKey = 'today';
			} else if (entry.visitedAt >= yesterday) {
				groupKey = 'yesterday';
			} else {
				groupKey = 'older';
			}

			if (!groups.has(groupKey)) {
				groups.set(groupKey, []);
			}
			groups.get(groupKey)!.push(entry);
		});

		return groups;
	}

	private async renderDayGroup(dayKey: string, entries: HistoryEntry[]) {
		const dayContainer = this.historyWindow.querySelector(
			`[data-day="${dayKey}"]`
		);
		const list = dayContainer?.querySelector('[data-list]');

		if (!list) return;

		entries.sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime());

		for (const entry of entries) {
			const historyItem = await this.createHistoryItem(entry);
			list.appendChild(historyItem);
		}
	}

	private async createHistoryItem(entry: HistoryEntry): Promise<HTMLElement> {
		const template = document.getElementById(
			'history-item-template'
		) as HTMLTemplateElement;
		const clone = template.content.cloneNode(true) as DocumentFragment;
		const item = clone.querySelector('a')!;

		item.setAttribute('data-history-id', entry.id);
		item.setAttribute('data-history-url', entry.url);
		item.href = entry.url;

		const faviconContainer = item.querySelector(
			'.h-5.w-5.rounded-sm'
		) as HTMLElement;
		const favicon = item.querySelector(
			'.history_favicon'
		) as HTMLImageElement;
		const fallbackIcon = faviconContainer.querySelector('i') as HTMLElement;

		if (entry.favicon) {
			favicon.src = entry.favicon;
			favicon.style.display = '';
			if (fallbackIcon) fallbackIcon.style.display = 'none';
		} else {
			favicon.style.display = 'none';
			if (fallbackIcon) fallbackIcon.style.display = '';
		}

		const titleEl = item.querySelector('.history_title')!;
		if (this.searchQuery) {
			titleEl.innerHTML = this.highlightSearch(entry.title);
		} else {
			titleEl.textContent = entry.title;
		}

		const hostnameEl = item.querySelector('.history_hostname')!;
		const timeEl = item.querySelector('.history_time')!;

		try {
			const url = new URL(entry.url);
			const hostname = this.searchQuery
				? this.highlightSearch(url.hostname)
				: url.hostname;
			if (this.searchQuery) {
				hostnameEl.innerHTML = hostname;
			} else {
				hostnameEl.textContent = hostname;
			}
		} catch {
			const displayUrl = this.searchQuery
				? this.highlightSearch(entry.url)
				: entry.url;
			if (this.searchQuery) {
				hostnameEl.innerHTML = displayUrl;
			} else {
				hostnameEl.textContent = displayUrl;
			}
		}

		timeEl.textContent = this.formatTime(entry.visitedAt);
		timeEl.setAttribute('datetime', entry.visitedAt.toISOString());

		if (entry.visitCount > 1) {
			const badge = document.createElement('span');
			badge.className =
				'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[var(--main-35a)] text-[var(--text)]';
			badge.textContent = `${entry.visitCount}x`;
			badge.title = `Visited ${entry.visitCount} times`;

			const timeContainer = timeEl.parentElement!;
			timeContainer.appendChild(document.createTextNode(' • '));
			timeContainer.appendChild(badge);
		}

		if (entry.lastVisitDuration && entry.lastVisitDuration > 5000) {
			const duration = this.formatDuration(entry.lastVisitDuration);
			const durationSpan = document.createElement('span');
			durationSpan.className = 'text-[var(--proto)]';
			durationSpan.textContent = ` • ${duration}`;
			durationSpan.title = 'Time spent on page';

			const timeContainer = timeEl.parentElement!;
			timeContainer.appendChild(durationSpan);
		}

		return item;
	}

	private highlightSearch(text: string): string {
		if (!this.searchQuery) return text;

		const regex = new RegExp(
			`(${this.escapeRegex(this.searchQuery)})`,
			'gi'
		);
		return text.replace(
			regex,
			'<mark class="bg-[var(--main-35a)] text-[var(--text)]">$1</mark>'
		);
	}

	private escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private formatTime(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);
		const diffDays = diffMs / (1000 * 60 * 60 * 24);

		if (diffMs < 60000) {
			return 'Just now';
		} else if (diffMs < 3600000) {
			const minutes = Math.floor(diffMs / 60000);
			return `${minutes}m ago`;
		} else if (diffHours < 24) {
			return date.toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			});
		} else if (diffDays < 7) {
			const days = Math.floor(diffDays);
			return `${days}d ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m`;
		} else {
			return `${seconds}s`;
		}
	}

	private showEmptyState() {
		this.historyWindow.style.display = 'none';
		this.emptyState.removeAttribute('hidden');
	}

	private hideEmptyState() {
		this.historyWindow.style.display = '';
		this.emptyState.setAttribute('hidden', '');
	}

	private updateStats() {
		const stats = this.historyManager.getHistoryStats();
		this.historyCount.textContent = stats.totalEntries.toString();
	}

	private setupPeriodicMaintenance() {
		setInterval(
			() => {
				this.historyManager.performMaintenance().catch(error => {
					console.warn('History maintenance failed:', error);
				});
			},
			60 * 60 * 1000
		);
	}

	public async refreshHistory() {
		await this.historyManager.loadFromStorage();
		await this.renderHistory();
		this.updateStats();
	}

	public getHistoryManager(): HistoryManager {
		return this.historyManager;
	}

	public async exportHistory() {
		try {
			const data = await this.historyManager.exportData();
			const blob = new Blob([data], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			const a = document.createElement('a');
			a.href = url;
			a.download = `browsing-history-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);

			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Export error:', error);
			alert('Failed to export browsing history');
		}
	}

	public async importHistory() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				await this.historyManager.importData(text);
				await this.renderHistory();
				this.updateStats();
				alert('History imported successfully!');
			} catch (error) {
				console.error('Import error:', error);
				alert(
					'Failed to import history. Please check the file format.'
				);
			}
		};

		input.click();
	}
}

document.addEventListener('DOMContentLoaded', async () => {
	const historyUI = new HistoryUI();

	(window as any).historyUI = historyUI;
	(window as any).debugHistory = () => {
		console.log('History Manager:', historyUI.getHistoryManager());
		console.log('All entries:', historyUI.getHistoryManager().getEntries());
		console.log('Stats:', historyUI.getHistoryManager().getHistoryStats());
	};

	createIcons({ icons });
});
