import type { TabsInterface } from './types';

export class TabPageClient {
	private tabs: TabsInterface;
	private observers: Map<string, MutationObserver> = new Map();
	private intervalIds: Map<string, number[]> = new Map();
	private linkContextHandlers: Map<string, (event: MouseEvent) => void> =
		new Map();

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	pageClient = (iframe: HTMLIFrameElement): void => {
		this.setupWindowOpenInterceptor(iframe);
		this.setupClickListener(iframe);
		this.setupLinkContextBridge(iframe);
		this.setupErrorPageRedirect(iframe);
		this.setupNavigationTracking(iframe);
		this.setupKeyboardHandler(iframe);
	};

	cleanupIframe = (iframeId: string): void => {
		const observer = this.observers.get(iframeId);
		if (observer) {
			observer.disconnect();
			this.observers.delete(iframeId);
		}

		const intervals = this.intervalIds.get(iframeId);
		if (intervals) {
			intervals.forEach(id => clearTimeout(id));
			this.intervalIds.delete(iframeId);
		}

		const contextHandler = this.linkContextHandlers.get(iframeId);
		if (contextHandler) {
			try {
				const iframe = document.getElementById(
					iframeId
				) as HTMLIFrameElement | null;
				iframe?.contentDocument?.removeEventListener(
					'contextmenu',
					contextHandler,
					true
				);
			} catch {
				// ignore
			}
			this.linkContextHandlers.delete(iframeId);
		}
	};

	cleanupAll = (): void => {
		this.observers.forEach(observer => observer.disconnect());
		this.observers.clear();

		this.intervalIds.forEach(intervals => {
			intervals.forEach(id => clearTimeout(id));
		});
		this.intervalIds.clear();

		this.linkContextHandlers.forEach((handler, iframeId) => {
			try {
				const iframe = document.getElementById(
					iframeId
				) as HTMLIFrameElement | null;
				iframe?.contentDocument?.removeEventListener(
					'contextmenu',
					handler,
					true
				);
			} catch {
				// ignore
			}
		});
		this.linkContextHandlers.clear();
	};

	private setupLinkContextBridge(iframe: HTMLIFrameElement): void {
		if (!iframe.contentDocument) return;

		const existing = this.linkContextHandlers.get(iframe.id);
		if (existing) {
			iframe.contentDocument.removeEventListener(
				'contextmenu',
				existing,
				true
			);
		}

		const handler = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			const anchor = target?.closest(
				'a[href]'
			) as HTMLAnchorElement | null;
			if (!anchor) return;

			event.preventDefault();
			event.stopPropagation();

			const href = anchor.href;
			const text = (anchor.textContent || '').trim();
			this.openLinkContextMenu(event, href, text);
		};

		iframe.contentDocument.addEventListener('contextmenu', handler, true);
		this.linkContextHandlers.set(iframe.id, handler);
	}

	private openLinkContextMenu(
		event: MouseEvent,
		href: string,
		text: string
	): void {
		const rightClickMenu =
			this.tabs.ui?.rightclickmenu ??
			this.tabs.ui?.np?.rightclickmenu ??
			this.tabs.nightmarePlugins?.rightclickmenu;

		if (!rightClickMenu) return;

		rightClickMenu.closeMenu();

		const menu = this.tabs.ui.createElement(
			'div',
			{
				class: 'fixed z-50 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 min-w-56',
				style: 'backdrop-filter: blur(8px);'
			},
			[
				this.tabs.ui.createElement(
					'button',
					{
						class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
						onclick: async () => {
							await this.tabs.createTab(href);
							rightClickMenu.closeMenu();
						}
					},
					[
						this.tabs.ui.createElement(
							'i',
							{
								'data-lucide': 'external-link',
								class: 'h-4 w-4'
							},
							[]
						),
						this.tabs.ui.createElement('span', {}, [
							'Open Link in New Tab'
						])
					]
				),
				this.tabs.ui.createElement(
					'button',
					{
						class: 'flex items-center gap-3 px-4 py-2 opacity-60 cursor-not-allowed w-full text-left text-sm rounded-md',
						disabled: true
					},
					[
						this.tabs.ui.createElement(
							'i',
							{ 'data-lucide': 'columns-2', class: 'h-4 w-4' },
							[]
						),
						this.tabs.ui.createElement('span', {}, [
							'Open Link in Split View'
						])
					]
				),
				this.tabs.ui.createElement(
					'button',
					{
						class: 'flex items-center gap-3 px-4 py-2 hover:bg-[var(--white-05)] transition-colors w-full text-left text-sm rounded-md',
						onclick: async () => {
							try {
								await navigator.clipboard.writeText(href);
							} catch {
								// no-op
							}
							rightClickMenu.closeMenu();
						}
					},
					[
						this.tabs.ui.createElement(
							'i',
							{ 'data-lucide': 'copy', class: 'h-4 w-4' },
							[]
						),
						this.tabs.ui.createElement('span', {}, [
							'Copy Link Address'
						])
					]
				),
				this.tabs.ui.createElement('div', {
					class: 'h-px bg-[var(--white-08)] my-1'
				}),
				this.tabs.ui.createElement(
					'div',
					{
						class: 'px-4 py-1 text-xs text-[var(--text)]/60 truncate',
						title: href
					},
					[text || href]
				)
			]
		);

		const tempAnchor = this.tabs.ui.createElement('div', {
			style: `position:fixed;left:${event.pageX}px;top:${event.pageY}px;width:1px;height:1px;opacity:0;pointer-events:none;`
		});
		document.body.appendChild(tempAnchor);

		rightClickMenu.openMenu(tempAnchor, event, menu);

		setTimeout(() => {
			tempAnchor.remove();
		}, 0);
	}

	private setupWindowOpenInterceptor(iframe: HTMLIFrameElement): void {
		if (!iframe.contentWindow) return;

		iframe.contentWindow.window.open = (
			url?: string | URL
		): Window | null => {
			this.handleWindowOpen(url);
			return null;
		};
	}

	private async handleWindowOpen(url?: string | URL): Promise<void> {
		try {
			if (!url) return;

			const urlString = url instanceof URL ? url.href : url.toString();
			console.log('Opening new tab with URL:', urlString);

			await this.tabs.createTab(urlString);
			this.tabs.logger.createLog(
				`New tab opened via window.open: ${urlString}`
			);
		} catch (error) {
			console.error('Error opening new tab via window.open:', error);
		}
	}

	private setupClickListener(iframe: HTMLIFrameElement): void {
		iframe.contentWindow?.document.body.addEventListener('click', () => {
			window.parent.eventsAPI.emit('ddx:page.clicked', null);
		});
	}

	private setupNavigationTracking(iframe: HTMLIFrameElement): void {
		if (!iframe.contentWindow) return;

		const iframeId = iframe.id;
		let lastKnownUrl = iframe.contentWindow.location.href;

		const checkUrlChange = () => {
			try {
				const currentUrl = iframe.contentWindow?.location?.href;
				if (currentUrl && currentUrl !== lastKnownUrl) {
					lastKnownUrl = currentUrl;
					this.handleUrlChange(iframe);
				}
			} catch (e) {
				console.warn('Could not check URL change:', e);
			}
		};

		iframe.contentWindow.document.addEventListener('click', e => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' || target.closest('a')) {
				setTimeout(checkUrlChange, 100);
				setTimeout(checkUrlChange, 500);
				setTimeout(checkUrlChange, 1000);
			}
		});

		iframe.contentWindow.document.addEventListener('submit', () => {
			setTimeout(checkUrlChange, 100);
			setTimeout(checkUrlChange, 500);
			setTimeout(checkUrlChange, 1000);
		});

		const observer = new MutationObserver(() => {
			checkUrlChange();
		});

		observer.observe(iframe.contentWindow.document.documentElement, {
			childList: true,
			subtree: true
		});

		this.observers.set(iframeId, observer);
	}

	private handleUrlChange(iframe: HTMLIFrameElement): void {
		const iframeLoadedEvent = new CustomEvent('iframeLoaded', {
			detail: {
				tabId: iframe.id.replace('iframe-', 'tab-'),
				iframe,
				tabElement: document.getElementById(
					iframe.id.replace('iframe-', 'tab-')
				)
			}
		});
		document.dispatchEvent(iframeLoadedEvent);
	}

	private setupErrorPageRedirect(iframe: HTMLIFrameElement): void {
		iframe.addEventListener('load', () => {
			this.checkForErrorTrace(iframe);
		});
	}

	private checkForErrorTrace(iframe: HTMLIFrameElement): void {
		const currentUrl = iframe.src;

		if (this.isErrorPage(currentUrl)) return;

		const errorTrace = iframe.contentWindow?.document.getElementById(
			'errorTrace'
		) as HTMLTextAreaElement | null;

		if (errorTrace?.value) {
			this.redirectToErrorPage(iframe, errorTrace.value);
		}
	}

	private setupKeyboardHandler(iframe: HTMLIFrameElement): void {
		if (!iframe.contentWindow) return;

		try {
			iframe.contentWindow.document.addEventListener(
				'keydown',
				async event => {
					const keyboardManager = (window as any).functions
						?.keyboardManager;
					if (
						keyboardManager &&
						typeof keyboardManager.handleKeyDown === 'function'
					) {
						await keyboardManager.handleKeyDown(event);
					}
				},
				true
			);
			console.log('[PageClient] Keyboard handler attached to iframe');
		} catch (error) {
			console.warn(
				'[PageClient] Could not attach keyboard handler:',
				error
			);
		}
	}

	private isErrorPage(url: string): boolean {
		try {
			const internalUrl = this.tabs.proto.getInternalURL(url);
			return (
				internalUrl === 'ddx://error/' ||
				url.includes('/internal/error/')
			);
		} catch {
			return url.includes('/internal/error/');
		}
	}

	private redirectToErrorPage(
		iframe: HTMLIFrameElement,
		errorMessage: string
	): void {
		const errorPageHandler = (): void => {
			try {
				const errorTextarea =
					iframe.contentWindow?.document.getElementById(
						'error-textarea'
					) as HTMLTextAreaElement | null;

				if (errorTextarea) {
					errorTextarea.value = errorMessage;
				}
			} catch (err) {
				console.error('Failed to populate error textarea:', err);
			} finally {
				iframe.removeEventListener('load', errorPageHandler);
			}
		};

		iframe.addEventListener('load', errorPageHandler);
		this.tabs.proto.navigate('error');
	}
}
